import { BadRequestException, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigRegistryService } from '../config/config-registry.service';
import type { ConnectionTestResponse } from '../contracts/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Délai maximal d'une demande de jeton à Microsoft. */
const ENTRA_TIMEOUT_MS = 10_000;

/** Longueur maximale du détail technique recopié dans un message d'échec. */
const MAX_DETAIL_LENGTH = 300;

/**
 * Message d'échec d'un test : une phrase française, suivie du détail rendu par
 * le serveur distant, réduit à sa première ligne (jamais une pile d'appels),
 * tronqué, et dont toute occurrence d'un secret configuré est masquée — un
 * serveur peut recopier ce qu'on lui a envoyé dans sa réponse.
 */
export function failureMessage(context: string, detail: unknown, secrets: readonly (string | null)[]): string {
  const raw = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : '';
  const firstLine = (raw.split(/\r?\n/)[0] ?? '').trim().slice(0, MAX_DETAIL_LENGTH);
  const redacted = secrets
    .filter((secret): secret is string => !!secret && secret.length >= 4)
    .reduce((text, secret) => text.split(secret).join('••••'), firstLine);
  return redacted ? `${context} : ${redacted}` : `${context}.`;
}

function failure(context: string, err: unknown, secrets: readonly (string | null)[]): ConnectionTestResponse {
  return { ok: false, message: failureMessage(context, err, secrets) };
}

function testEmailHtml(host: string, port: number): string {
  return `
    <div style="font-family:'Hanken Grotesk',Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1B1A18">
      <h2 style="color:#D8372B">Test de configuration SMTP ✓</h2>
      <p>Cet email confirme que votre configuration SMTP est correctement paramétrée dans l'application <strong>Bons de mise à disposition</strong>.</p>
      <p style="color:#6B665E;font-size:13px">Envoyé depuis : <code>${host}:${port}</code></p>
      <hr style="border:none;border-top:1px solid #E2DFD9;margin:16px 0">
      <p style="font-size:12px;color:#A79F94">Équipe informatique — Groupe Livio</p>
    </div>`;
}

/**
 * Tests de connexion de l'écran Configuration (SMTP, Entra ID), avec les
 * réglages enregistrés. Un test qui aboutit à un échec répond `{ ok: false,
 * message }` : c'est le résultat du test, pas une erreur de l'API.
 */
@Injectable()
export class ConnectionTestsService {
  constructor(private readonly settings: ConfigRegistryService) {}

  /** Vérifie le serveur SMTP ; envoie en plus un vrai email si `testEmail` est donné. */
  async testSmtp(testEmail?: string): Promise<ConnectionTestResponse> {
    if (testEmail && !EMAIL_RE.test(testEmail)) {
      throw new BadRequestException('Adresse email invalide');
    }
    try {
      const host = await this.settings.getString('smtp.host');
      if (!host) return { ok: false, message: 'Configuration SMTP incomplète : serveur SMTP non renseigné.' };
      const from = await this.settings.getString('smtp.from');
      // Jamais d'expéditeur inventé : il serait rejeté ou classé en indésirable.
      if (testEmail && !from) return { ok: false, message: "Adresse d'expéditeur non renseignée." };
      const port = await this.settings.getInt('smtp.port');
      const transporter = await this.buildTransporter(host, port);
      await transporter.verify();
      if (!testEmail || !from) return { ok: true, message: 'Connexion SMTP réussie (serveur joignable).' };
      await transporter.sendMail({
        from,
        to: testEmail,
        subject: '[Test] Bons de mise à disposition — Test SMTP',
        html: testEmailHtml(host, port),
      });
      return { ok: true, message: `Email de test envoyé à ${testEmail}.` };
    } catch (err) {
      return failure('Échec de la connexion SMTP', err, [await this.settings.getString('smtp.password')]);
    }
  }

  /** Même construction que l'envoi réel : l'authentification seulement avec
   *  utilisateur ET mot de passe. */
  private async buildTransporter(host: string, port: number): Promise<nodemailer.Transporter> {
    const user = await this.settings.getString('smtp.user');
    const pass = await this.settings.getString('smtp.password');
    return nodemailer.createTransport({
      host,
      port,
      secure: await this.settings.getBool('smtp.secure'),
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    });
  }

  /** Demande un jeton d'application à Microsoft avec l'identifiant et le secret saisis. */
  async testEntra(): Promise<ConnectionTestResponse> {
    try {
      const tenantId = await this.settings.getString('entra.tenant_id');
      const clientId = await this.settings.getString('entra.client_id');
      const clientSecret = await this.settings.getString('entra.client_secret');
      if (!tenantId || !clientId || !clientSecret) {
        return { ok: false, message: 'Configuration Entra ID incomplète : Tenant ID, Client ID et Client Secret sont requis.' };
      }
      const response = await this.requestToken(tenantId, clientId, clientSecret);
      if (response.ok) return { ok: true, message: 'Connexion Entra ID réussie.' };
      const body = (await response.json().catch(() => ({}))) as { error_description?: string };
      return failure('Microsoft a refusé la demande de jeton', body.error_description, [clientSecret]);
    } catch (err) {
      return failure('Échec de la connexion à Entra ID', err, [await this.settings.getString('entra.client_secret')]);
    }
  }

  private async requestToken(tenantId: string, clientId: string, clientSecret: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENTRA_TIMEOUT_MS);
    try {
      return await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
