import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AdminService {
  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getConfigSection(category: string, options?: { maskSecrets?: boolean }) {
    return this.configService.getAll(category, options);
  }

  async setConfigValue(
    category: string,
    key: string,
    value: string,
    options?: { encrypted?: boolean; description?: string; updatedById?: string },
  ) {
    await this.configService.set(category, key, value, options);
  }

  async bulkSetConfig(
    category: string,
    values: Record<string, string>,
    encryptedKeys: string[] = [],
    updatedById?: string,
  ) {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) continue;
      await this.configService.set(category, key, value, {
        encrypted: encryptedKeys.includes(key),
        updatedById,
      });
    }
    this.configService.invalidateCache(category);
  }

  async testSmtp(testEmail?: string): Promise<{ success: boolean; message: string }> {
    try {
      const host = await this.configService.get('smtp', 'host');
      const port = await this.configService.get('smtp', 'port');
      const user = await this.configService.get('smtp', 'user');
      const pass = await this.configService.get('smtp', 'password');
      const secure = await this.configService.get('smtp', 'secure');
      const from = await this.configService.get('smtp', 'from') || 'noreply@groupelivio.fr';

      if (!host || !port) {
        return { success: false, message: 'Configuration SMTP incomplète (host/port manquant)' };
      }

      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: secure === 'true',
        auth: user && pass ? { user, pass } : undefined,
        tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
      });

      await transporter.verify();

      // If a test email is provided, send a real test message
      if (testEmail) {
        await transporter.sendMail({
          from,
          to: testEmail,
          subject: '[Test] Bons de mise à disposition — Test SMTP',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1e293b">
              <h2 style="color:#1e40af">Test de configuration SMTP ✓</h2>
              <p>Cet email confirme que votre configuration SMTP est correctement paramétrée dans l'application <strong>Bons de mise à disposition</strong>.</p>
              <p style="color:#64748b;font-size:13px">Envoyé depuis : <code>${host}:${port}</code></p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
              <p style="font-size:12px;color:#94a3b8">Service informatique — Groupe Livio</p>
            </div>`,
        });
        return { success: true, message: `Email de test envoyé à ${testEmail}` };
      }

      return { success: true, message: 'Connexion SMTP réussie (serveur joignable)' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erreur de connexion SMTP' };
    }
  }

  async purgeLdapUsers(): Promise<{ deleted: number }> {
    // Tente la suppression physique ; si FK violation, replie sur désactivation
    try {
      const result = await this.prisma.user.deleteMany({
        where: { isLocalAccount: false },
      });
      return { deleted: result.count };
    } catch {
      // Des users sont référencés par des bons → on les désactive seulement
      const result = await this.prisma.user.updateMany({
        where: { isLocalAccount: false },
        data: { active: false },
      });
      return { deleted: result.count };
    }
  }

  async testEntra(): Promise<{ success: boolean; message: string }> {
    try {
      const tenantId = await this.configService.get('entra', 'tenant_id');
      const clientId = await this.configService.get('entra', 'client_id');
      const clientSecret = await this.configService.get('entra', 'client_secret');

      if (!tenantId || !clientId || !clientSecret) {
        return { success: false, message: 'Configuration Entra ID incomplète' };
      }

      // Test: try to get an app token from the Microsoft identity platform
      const response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
          }),
        },
      );

      if (response.ok) {
        return { success: true, message: 'Connexion Entra ID réussie' };
      } else {
        const body = await response.json() as any;
        return { success: false, message: body.error_description || 'Erreur Entra ID' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Erreur de connexion Entra ID' };
    }
  }
}
