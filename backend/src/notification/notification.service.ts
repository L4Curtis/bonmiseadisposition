import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { generateSignatureToken } from '../common/tokens';
import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body as emailBody,
  footer,
  quoteBox,
  sectionLabel,
  equipList,
  refBadge,
} from '../templates/email-layout';
import { NotificationBon, NotificationType } from '../common/types';

/** Escape user-supplied strings before embedding in HTML email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Résultat d'un envoi d'email : conserve le détail de l'erreur SMTP réelle
 *  (au lieu d'un libellé générique) pour la persister dans NotificationLog. */
export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

const MAX_ERROR_MESSAGE_LENGTH = 500;

/** Tronque le message d'erreur avant persistance (colonne errorMessage). */
function truncateErrorMessage(error: string | undefined): string {
  const message = error ?? "Erreur d'envoi inconnue";
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : message;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  private cachedTransporter: nodemailer.Transporter | null = null;
  private transporterCacheKey: string | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ─── Transport ──────────────────────────────────────────────────────────────
  // No explicit invalidation needed: the transporter cache key is derived from
  // the current SMTP config values, and AdminService.bulkSetConfig invalidates
  // the config cache — a config change therefore rebuilds the transporter.

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const host = await this.configService.get('smtp', 'host');
    const port = await this.configService.get('smtp', 'port');
    const user = await this.configService.get('smtp', 'user');
    const pass = await this.configService.get('smtp', 'password');
    const secure = await this.configService.get('smtp', 'secure');

    if (!host) return null;

    // Build a cache key from current SMTP settings to detect config changes
    const cacheKey = JSON.stringify({ host, port, user, pass, secure });
    if (this.cachedTransporter && this.transporterCacheKey === cacheKey) {
      return this.cachedTransporter;
    }

    this.cachedTransporter = nodemailer.createTransport({
      host,
      port: port ? parseInt(port) : 587,
      secure: secure === 'true',
      // Construction IDENTIQUE au test SMTP (admin.service.testSmtp) : n'active
      // l'auth que si user ET password sont présents. Sinon un relais sans auth
      // (user renseigné, mot de passe vide) passait le test mais échouait à
      // l'envoi réel — tentative d'AUTH avec un mot de passe vide → rejet serveur.
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    });
    this.transporterCacheKey = cacheKey;
    return this.cachedTransporter;
  }

  /** Aucun expéditeur codé en dur : une config manquante est une erreur explicite,
   *  pas un envoi silencieux depuis un domaine par défaut. */
  private async getFromAddress(): Promise<string> {
    return (await this.configService.get('smtp', 'from')) || '';
  }

  /** Slash final retiré (évite les doubles slashes dans les liens de signature).
   *  En production, une config absente est une erreur explicite plutôt qu'un
   *  repli silencieux sur localhost. */
  private async getAppUrl(): Promise<string> {
    const url = await this.configService.get('general', 'app_url');
    if (url) return url.replace(/\/+$/, '');
    if (process.env.NODE_ENV === 'production') {
      this.logger.error("URL de l'application (general.app_url) non configurée en production");
      return '';
    }
    return (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        const error = 'SMTP non configuré';
        this.logger.warn(`Email non envoyé (${error}) → ${to}: ${subject}`);
        return { ok: false, error };
      }
      const from = await this.getFromAddress();
      if (!from) {
        const error = 'Expéditeur SMTP (smtp.from) non configuré';
        this.logger.error(error);
        return { ok: false, error };
      }
      await transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email envoyé → ${to}: ${subject}`);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erreur envoi email → ${to}: ${error}`);
      return { ok: false, error };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildEquipList(equipments: NonNullable<NotificationBon['equipments']>): string {
    const items = (equipments ?? [])
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';
  }

  private buildNotReturnedList(equipments: NonNullable<NotificationBon['equipments']>): string {
    const items = (equipments ?? [])
      .filter((eq) => eq.notReturned)
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${escapeHtml(eq.notReturnedReason ?? 'Motif non précisé')}</span>`;
        return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le procès-verbal en ligne</li>';
  }

  private buildLoanedEquipList(equipments: NonNullable<NotificationBon['equipments']>): string {
    const items = (equipments ?? [])
      .filter((eq) => !eq.returnedAt && !eq.notReturned)
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';
  }

  /**
   * Garde commune à tous les emails "à lien" (signature ou portail) : un lien
   * construit sur une app_url vide serait relatif (ex. "/signer/xxx" ou
   * "/mes-bons") — un lien mort silencieusement envoyé et journalisé "sent".
   * Bloque l'envoi, journalise explicitement l'échec (status 'failed') et
   * retourne true pour que l'appelant s'arrête sans envoyer.
   */
  private async blockIfAppUrlMissing(
    appUrl: string,
    bonId: string,
    recipientEmail: string,
    type: NotificationType,
    extra?: { reminderNumber?: number },
  ): Promise<boolean> {
    if (appUrl) return false;

    const error = "URL de l'application (general.app_url) non configurée";
    this.logger.error(`Email non envoyé (bon ${bonId}, type ${type}) : ${error}`);
    await this.prisma.notificationLog.create({
      data: {
        bonId,
        recipientEmail,
        type,
        status: 'failed',
        errorMessage: error,
        ...(extra?.reminderNumber !== undefined ? { reminderNumber: extra.reminderNumber } : {}),
      },
    });
    return true;
  }

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await this.blockIfAppUrlMissing(appUrl, bon.id, bon.collaborateurEmail, 'mise_dispo_request')) {
      return;
    }

    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const dateMise = new Date(bon.dateMiseDisposition ?? new Date()).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const html = await this.templatesService.renderTemplate('mise_disposition_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      DATE_MISE_DISPO: dateMise,
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      EQUIP_LIST: this.buildEquipList(bon.equipments ?? []),
    });

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de mise à disposition à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mise_dispo_request',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await this.blockIfAppUrlMissing(appUrl, bon.id, bon.collaborateurEmail, 'restitution_request')) {
      return;
    }

    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    // Only list equipment being returned (returnedAt set), not all bon equipment
    const returnedEquipments = (bon.equipments ?? []).filter((eq) => eq.returnedAt);
    const remainingEquipments = (bon.equipments ?? []).filter((eq) => !eq.returnedAt && !eq.notReturned);
    const equipList = returnedEquipments.length > 0
      ? this.buildEquipList(returnedEquipments)
      : this.buildEquipList(bon.equipments ?? []);

    // Build remaining equipment section HTML for partial restitution
    const remainingSection = remainingEquipments.length > 0
      ? `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#A79F94;text-transform:uppercase;letter-spacing:0.08em">Éléments restants sur ce bon (${remainingEquipments.length})</p>
      <div style="background-color:#F6F3EE;border:1px solid #E2DFD9;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none">${this.buildEquipList(remainingEquipments)}</ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#6B665E;line-height:1.6;background:#F6F3EE;border:1px solid #E2DFD9;border-radius:8px;padding:10px 14px">Ces équipements ne font pas partie de cette restitution et restent attribués.</p>`
      : '';

    const html = await this.templatesService.renderTemplate('restitution_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      EQUIP_LIST: equipList,
      REMAINING_SECTION: remainingSection,
    });

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de restitution à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'restitution_request',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  async sendSignatureConfirmation(
    bon: NotificationBon,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const templateId =
      type === 'mise_disposition'
        ? 'confirmation_mise_disposition'
        : type === 'pv_cloture'
          ? 'confirmation_pv_cloture'
          : 'confirmation_restitution';
    const typLabel =
      type === 'pv_cloture'
        ? "procès-verbal d'équipements non restitués"
        : type === 'restitution'
          ? 'restitution'
          : 'mise à disposition';

    const html = await this.templatesService.renderTemplate(templateId, {
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      TYPE_LABEL: typLabel,
    });

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Confirmation de signature — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'confirmation',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await this.blockIfAppUrlMissing(appUrl, bon.id, bon.collaborateurEmail, 'pv_cloture_request')) {
      return;
    }

    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('pv_cloture_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      NOT_RETURNED_LIST: this.buildNotReturnedList(bon.equipments ?? []),
    });

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Procès-verbal d'équipements non restitués à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'pv_cloture_request',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  // ─── Rappel restitution prévue ──────────────────────────────────────────────
  // Envoyé une seule fois par bon (idempotence portée par le cron via
  // NotificationLog — voir runRestitutionDueReminders). Contrairement aux
  // autres rappels, ce message ne porte pas de lien de signature : il pointe
  // vers le portail collaborateur ({{PORTAIL_URL}} = getAppUrl() + '/mes-bons').

  async sendRestitutionDueReminder(bon: NotificationBon): Promise<boolean> {
    const appUrl = await this.getAppUrl();
    const recipientEmail = bon.collaborateur?.email ?? bon.collaborateurEmail;

    if (await this.blockIfAppUrlMissing(appUrl, bon.id, recipientEmail, 'restitution_due_reminder')) {
      return false;
    }

    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const dateRestitution = bon.dateRestitution
      ? new Date(bon.dateRestitution).toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
        })
      : '';

    const html = await this.templatesService.renderTemplate('restitution_due_reminder', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      DATE_RESTITUTION: dateRestitution,
      EQUIP_LIST: this.buildLoanedEquipList(bon.equipments ?? []),
      PORTAIL_URL: `${appUrl}/mes-bons`,
    });

    const result = await this.sendEmail(
      recipientEmail,
      `Restitution prévue le ${dateRestitution} — bon ${bon.reference}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail,
        type: 'restitution_due_reminder',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });

    return result.ok;
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  async sendContestationAlert(bon: NotificationBon, contestingUser: { displayName?: string; email?: string }, message: string): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const reference = bon.reference ?? '';
    const userName = contestingUser?.displayName ?? contestingUser?.email ?? '';

    const itStaff = await this.prisma.user.findMany({
      where: { isItStaff: true, active: true },
      select: { email: true },
    });
    if (itStaff.length === 0) {
      const error = 'Aucun utilisateur IT actif';
      this.logger.warn(`Alerte contestation non envoyée (bon ${reference}) : ${error}`);
      await this.prisma.notificationLog.create({
        data: {
          bonId: bon.id,
          recipientEmail: '',
          type: 'contestation_alert',
          status: 'failed',
          errorMessage: error,
        },
      });
      return;
    }

    const html = await this.templatesService.renderTemplate('contestation_alert', {
      USER_NAME: escapeHtml(userName),
      REFERENCE: escapeHtml(reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      CONTESTATION_MESSAGE: escapeHtml(message),
    });

    // Subjects are plain text — no HTML escaping (entities would show verbatim)
    const results = await Promise.all(
      itStaff.map((staff) =>
        this.sendEmail(
          staff.email,
          `[CONTESTATION] [${reference}] ${userName} conteste son bon — ${filialeNom}`,
          html,
        ),
      ),
    );
    const anyOk = results.some((r) => r.ok);
    const combinedError = results
      .filter((r) => !r.ok)
      .map((r) => r.error ?? "Erreur d'envoi inconnue")
      .join('; ');

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: itStaff.map((s) => s.email).join(', '),
        type: 'contestation_alert',
        status: anyOk ? 'sent' : 'failed',
        errorMessage: anyOk ? null : truncateErrorMessage(combinedError),
      },
    });
  }

  async sendContestationResolution(
    bon: NotificationBon,
    collaborateur: { email: string },
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const templateId = action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected';

    const html = await this.templatesService.renderTemplate(templateId, {
      REFERENCE: escapeHtml(bon.reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      RESOLUTION_MESSAGE: resolutionMessage ? escapeHtml(resolutionMessage) : '',
    });

    const result = await this.sendEmail(
      collaborateur.email,
      `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: collaborateur.email,
        type: 'contestation_resolution',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  // ─── Cancel / MarkFound ──────────────────────────────────────────────────────

  async sendCancellationNotice(bon: NotificationBon): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';

    const html = emailWrapper(card(
      brandHeader('Bon annulé', escapeHtml(filialeNom), { text: 'Annulation', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le bon de mise à disposition ${refBadge(escapeHtml(bon.reference))}
        (${escapeHtml(filialeNom)}) a été <strong style="color:#991b1b">annulé</strong>.
        Aucune action n'est attendue de votre part.
      </p>
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
      footer(),
    ));

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — annulé`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'cancellation',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  async sendMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';

    const foundEquipments = (bon.equipments ?? []).filter((eq) =>
      equipmentIds.includes(eq.id),
    );

    const equipLines = foundEquipments
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? ` (N° série : ${escapeHtml(eq.serialNumber)})`
          : '';
        return `<li style="padding:6px 0;font-size:14px;color:#4A463F;list-style:none">${label}${serial}</li>`;
      })
      .join('\n');

    const equipItems = equipLines
      ? equipLines
      : '<li style="padding:6px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';

    const html = emailWrapper(card(
      brandHeader('Équipement(s) retrouvé(s)', escapeHtml(filialeNom), { text: 'Mise à jour', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le ou les équipements suivants, précédemment signalés comme non restitués
        sur le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}),
        ont été <strong style="color:#166534">retrouvés</strong> :
      </p>
      ${sectionLabel('Équipements retrouvés')}
      ${equipList(equipItems, '#f0fdf4', '#bbf7d0')}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
      footer(),
    ));

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — équipement(s) retrouvé(s)`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mark_found',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  // ─── Clôture unilatérale ─────────────────────────────────────────────────────

  async sendUnilateralCloseNotice(bon: NotificationBon, reason: string, newStatus: string): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
    const outcome =
      newStatus === 'active'
        ? 'la remise du matériel a été constatée et le bon est désormais actif'
        : 'le bon a été clôturé et archivé';

    const html = emailWrapper(card(
      brandHeader('Bon clôturé sans signature', escapeHtml(filialeNom), { text: 'Constat unilatéral', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        En l'absence de signature de votre part, ${outcome} par le service informatique
        pour le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}).
      </p>
      ${sectionLabel('Motif indiqué')}
      ${quoteBox('#d97706', '#fffbeb', '#fde68a', escapeHtml(reason))}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous contestez ce constat, veuillez contacter votre service informatique au plus vite.
      </p>
      `),
      footer(),
    ));

    const result = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — clôturé sans signature`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'unilateral_closure',
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : truncateErrorMessage(result.error),
      },
    });
  }

  // ─── Cron: Rappels quotidiens ────────────────────────────────────────────────
  // Reads the SAME config category/keys as the admin UI (category "rappels",
  // keys enabled / delay_1 / delay_2 / delay_3). Reminder N is sent once the
  // bon has been pending for delay_N days — staggered, never on consecutive
  // days unless configured that way. Couvre aussi les PV de non-restitution en
  // attente de co-signature (partially_returned).

  private parseDelay(raw: string | null, fallback: number): number {
    const n = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** Durée de validité des liens (tokens.expiry_days, bornée 1–30, défaut 7). */
  private async getTokenValidityDays(): Promise<number> {
    const raw = await this.configService.get('tokens', 'expiry_days');
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 7;
    return Math.min(30, Math.max(1, parsed));
  }

  /**
   * Régénère un token de signature pour un rappel quand le lien précédent a
   * expiré (sans nouveau lien, les rappels au-delà de la validité du token
   * seraient silencieusement inutiles). Reproduit SignatureService.generateToken
   * — importer SignatureService ici créerait un cycle de modules
   * (SignatureModule consomme déjà NotificationService).
   */
  private async regenerateSignatureToken(
    bonId: string,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
  ): Promise<{ token: string }> {
    await this.prisma.signature.updateMany({
      where: { bonId, type, signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });
    const validityDays = await this.getTokenValidityDays();
    const sig = await this.prisma.signature.create({
      data: {
        bonId,
        type,
        token: generateSignatureToken(),
        tokenExpiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
        isInPerson: false,
        initiatedById: null,
      },
    });
    this.logger.log(`Rappel: token ${type} régénéré pour le bon ${bonId}`);
    return sig;
  }

  @Cron('0 9 * * 1-5', { timeZone: 'Europe/Paris' }) // Lundi–Vendredi à 9h (heure de Paris)
  async sendDailyReminders(): Promise<void> {
    try {
      await this.runDailyReminders();
    } catch (err) {
      // The cron package does not catch rejected promises — never let this
      // escape as an unhandledRejection
      this.logger.error(`Cron rappels en échec: ${(err as Error).stack ?? err}`);
    }
  }

  private async runDailyReminders(): Promise<void> {
    this.logger.log('Cron rappels démarré');

    const remindersEnabled = await this.configService.get('rappels', 'enabled');
    if (remindersEnabled === 'false') {
      this.logger.log('Rappels désactivés par configuration');
      return;
    }

    // Aucune régénération de token ni requête inutile si le SMTP n'est pas
    // configuré : sans cette garde, chaque jour ouvré créait une nouvelle
    // Signature + un NotificationLog "failed" par bon en attente.
    const transporter = await this.getTransporter();
    if (!transporter) {
      this.logger.warn('Cron rappels : SMTP non configuré, aucun rappel envoyé');
      return;
    }

    const delays = [
      this.parseDelay(await this.configService.get('rappels', 'delay_1'), 3),
      this.parseDelay(await this.configService.get('rappels', 'delay_2'), 7),
      this.parseDelay(await this.configService.get('rappels', 'delay_3'), 14),
    ];
    const maxReminders = delays.length;
    const firstCutoff = new Date(Date.now() - delays[0] * 24 * 60 * 60 * 1000);

    const pendingBons = await this.prisma.bon.findMany({
      where: {
        // partially_returned inclus : PV de non-restitution (ou restitution
        // partielle) en attente de signature — sans rappel, ces bons restaient
        // bloqués en silence indéfiniment
        status: { in: ['sent_mise_dispo', 'sent_restitution', 'partially_returned'] },
        updatedAt: { lt: firstCutoff },
      },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        // La signature en attente la plus récente, MÊME si son token a expiré
        // naturellement : elle porte le type du document attendu, et le token
        // sera régénéré. Le filtre tokenExpiresAt > epoch exclut les lignes
        // invalidées VOLONTAIREMENT (resend, contestation, clôture — mises à
        // epoch 0) : sans lui, le cron ressusciterait des tokens du mauvais type.
        signatures: {
          where: {
            signed: false,
            type: { not: 'it_cachet' },
            tokenExpiresAt: { gt: new Date(1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        notifications: {
          where: { type: 'reminder', status: 'sent' },
          orderBy: { sentAt: 'desc' },
        },
      },
    });

    const appUrl = await this.getAppUrl();
    let sentCount = 0;

    const TYPE_LABELS: Record<string, string> = {
      mise_disposition: 'mise à disposition',
      restitution: 'restitution',
      pv_cloture: "procès-verbal d'équipements non restitués",
    };

    for (const bon of pendingBons) {
      try {
        const reminderCount = bon.notifications.length;
        if (reminderCount >= maxReminders) continue;

        // Staggered schedule: reminder N+1 fires once the bon has been pending
        // for delays[N] days since the last status change
        const pendingDays = (Date.now() - bon.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (pendingDays < delays[reminderCount]) continue;

        let sig = bon.signatures[0];
        if (!sig) continue; // aucun document en attente (ex: restitution partielle déjà signée)

        // Signature présentielle avec un token ENCORE VALIDE : un technicien peut
        // être en train de la faire signer sur place à cet instant. Régénérer
        // (via updateMany sur bonId+type) invaliderait ce lien en cours d'usage.
        // On saute simplement le rappel pour ce bon aujourd'hui.
        if (sig.isInPerson && sig.tokenExpiresAt.getTime() > Date.now()) {
          this.logger.debug(
            `Rappel ignoré pour le bon ${bon.id} (${bon.reference}) : signature présentielle en attente avec un token encore valide`,
          );
          continue;
        }

        // Vérifiée AVANT toute régénération de token : inutile de consommer
        // (et d'invalider) un token pour un email qui ne partira de toute
        // façon pas — app_url absente bloque l'envoi plus bas.
        if (
          await this.blockIfAppUrlMissing(appUrl, bon.id, bon.collaborateurEmail, 'reminder', {
            reminderNumber: reminderCount + 1,
          })
        ) {
          continue;
        }

        // Régénérer plutôt que d'envoyer un lien inutilisable :
        // - token expiré (sinon le rappel serait silencieusement un lien mort) ;
        // - token PRÉSENTIEL EXPIRÉ (isInPerson saute la vérification du
        //   destinataire : il ne doit jamais partir par email — on émet un
        //   token distant).
        if (sig.isInPerson || sig.tokenExpiresAt.getTime() <= Date.now()) {
          const fresh = await this.regenerateSignatureToken(
            bon.id,
            sig.type as 'mise_disposition' | 'restitution' | 'pv_cloture',
          );
          sig = { ...sig, token: fresh.token } as typeof sig;
        }

        const filialeNom = bon.filiale?.displayName ?? '';
        const typeLabel = TYPE_LABELS[sig.type] ?? 'mise à disposition';

        const html = await this.templatesService.renderTemplate('reminder', {
          TYPE_LABEL: typeLabel,
          REFERENCE: escapeHtml(bon.reference),
          SIGNER_URL: `${appUrl}/signer/${sig.token}`,
          REMINDER_NUMBER: String(reminderCount + 1),
          MAX_REMINDERS: String(maxReminders),
          FILIALE_NOM: escapeHtml(filialeNom),
        });

        const subjectDoc = sig.type === 'pv_cloture' ? 'Procès-verbal' : `Bon de ${typeLabel}`;
        const result = await this.sendEmail(
          bon.collaborateurEmail,
          `[RAPPEL] [${bon.reference}] ${subjectDoc} à signer — ${filialeNom}`,
          html,
        );
        if (result.ok) sentCount++;

        await this.prisma.notificationLog.create({
          data: {
            bonId: bon.id,
            recipientEmail: bon.collaborateurEmail,
            type: 'reminder',
            status: result.ok ? 'sent' : 'failed',
            errorMessage: result.ok ? null : truncateErrorMessage(result.error),
            reminderNumber: reminderCount + 1,
          },
        });
      } catch (err) {
        this.logger.error(`Erreur rappel bon ${bon.id} (${bon.reference}): ${err}`);
      }
    }

    this.logger.log(`Cron rappels terminé — ${pendingBons.length} bons éligibles, ${sentCount} rappels envoyés`);
  }

  // ─── Cron: Rappel avant restitution prévue ───────────────────────────────────
  // Lit rappels.restitution_before_days (même catégorie que les rappels
  // ci-dessus — cf. ALLOWED_CONFIG_KEYS.rappels dans admin.controller.ts).
  // Défaut 7 jours ; 0 désactive la fonctionnalité. Idempotence : seul un
  // NotificationLog de type restitution_due_reminder au statut 'sent' exclut
  // le bon de la requête ci-dessous (comme runDailyReminders) — un échec
  // transitoire (SMTP down, app_url absente) ne doit PAS bloquer tout
  // réessai les jours suivants. Un envoi RÉUSSI, en revanche, reste unique
  // pour ce bon même si sa dateRestitution change ensuite (report,
  // correction) : le filtre porte sur l'existence du log 'sent', pas sur la
  // date courante — un seul rappel réussi par bon, par construction.

  /** Comme parseDelay, mais 0 est une valeur valide (désactive la fonctionnalité) —
   *  parseDelay(...) rejette tout n <= 0 au profit du fallback, ce qui est
   *  incorrect ici : 0 doit être respecté, pas remplacé par le défaut. */
  private parseNonNegativeInt(raw: string | null, fallback: number): number {
    if (raw === null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /** Date calendaire (YYYY-MM-DD) d'un instant dans un fuseau donné. */
  private formatDateInTimeZone(date: Date, timeZone: string): string {
    // Locale en-CA : seule locale ICU dont le format court est nativement YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  /**
   * Fenêtre [aujourd'hui, aujourd'hui + N jours] en date locale Europe/Paris,
   * fin de journée incluse. Bornes exprimées en UTC minuit/23:59:59.999 :
   * cohérent avec les colonnes @db.Date (date calendaire sans heure, stockée
   * comme minuit UTC), tout en calculant "aujourd'hui" sur le fuseau Paris.
   */
  private getRestitutionWindow(beforeDays: number): { start: Date; end: Date } {
    const todayParis = this.formatDateInTimeZone(new Date(), 'Europe/Paris');
    const [year, month, day] = todayParis.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day + beforeDays, 23, 59, 59, 999));
    return { start, end };
  }

  @Cron('0 9 * * *', { name: 'restitution-due-reminder', timeZone: 'Europe/Paris' }) // Tous les jours à 9h (heure de Paris)
  async runRestitutionDueReminders(): Promise<void> {
    try {
      this.logger.log('Cron rappel restitution démarré');

      const rawDays = await this.configService.get('rappels', 'restitution_before_days');
      const beforeDays = this.parseNonNegativeInt(rawDays, 7);
      if (beforeDays === 0) {
        this.logger.log('Rappel de restitution désactivé par configuration (restitution_before_days = 0)');
        return;
      }

      // Même garde que les rappels quotidiens : pas de requête ni de log
      // "failed" en boucle si le SMTP n'est pas configuré.
      const transporter = await this.getTransporter();
      if (!transporter) {
        this.logger.warn('Cron rappel restitution : SMTP non configuré, aucun rappel envoyé');
        return;
      }

      const { start, end } = this.getRestitutionWindow(beforeDays);

      const eligibleBons = await this.prisma.bon.findMany({
        where: {
          // partially_returned inclus : équipements encore en possession du collaborateur
          // dont la date de restitution approche — le rappel reste pertinent même si
          // certains équipements ont déjà été restitués.
          status: { in: ['active', 'partially_returned'] },
          dateRestitution: { gte: start, lte: end },
          notifications: { none: { type: 'restitution_due_reminder', status: 'sent' } },
          equipments: { some: { returnedAt: null, notReturned: false } },
        },
        include: {
          filiale: true,
          collaborateur: { select: { id: true, displayName: true, email: true } },
          equipments: {
            orderBy: { order: 'asc' },
            include: { catalogItem: { select: { brand: true, model: true } } },
          },
        },
      });

      let sentCount = 0;
      let failedCount = 0;

      for (const bon of eligibleBons) {
        try {
          const ok = await this.sendRestitutionDueReminder(bon as unknown as NotificationBon);
          if (ok) sentCount++; else failedCount++;
        } catch (err) {
          failedCount++;
          this.logger.error(`Erreur rappel restitution bon ${bon.id} (${bon.reference}): ${err}`);
        }
      }

      this.logger.log(
        `Cron rappel restitution terminé — ${eligibleBons.length} bon(s) éligible(s), ${sentCount} envoyé(s), ${failedCount} échoué(s)`,
      );
    } catch (err) {
      // Le package cron ne rattrape pas les promesses rejetées — ne jamais
      // laisser fuir ceci en unhandledRejection.
      this.logger.error(`Cron rappel restitution en échec: ${(err as Error).stack ?? err}`);
    }
  }
}
