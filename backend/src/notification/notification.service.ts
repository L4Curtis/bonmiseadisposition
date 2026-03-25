import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { NotificationBon } from '../common/types';

/** Escape user-supplied strings before embedding in HTML email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

  /** Invalidate the cached SMTP transporter (call after SMTP settings change). */
  invalidateTransporterCache(): void {
    this.cachedTransporter = null;
    this.transporterCacheKey = null;
  }

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
      auth: user ? { user, pass: pass || '' } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    });
    this.transporterCacheKey = cacheKey;
    return this.cachedTransporter;
  }

  private async getFromAddress(): Promise<string> {
    const from = await this.configService.get('smtp', 'from');
    return from || 'noreply@groupelivio.fr';
  }

  private async getAppUrl(): Promise<string> {
    const url = await this.configService.get('general', 'app_url');
    return url || (process.env.FRONTEND_URL ?? 'http://localhost:5173');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        this.logger.warn(`Email non envoyé (SMTP non configuré) → ${to}: ${subject}`);
        return false;
      }
      const from = await this.getFromAddress();
      await transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email envoyé → ${to}: ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Erreur envoi email → ${to}: ${err}`);
      return false;
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
          ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        return `<li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le bon en ligne</li>';
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
          ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${escapeHtml(eq.notReturnedReason ?? 'Motif non précisé')}</span>`;
        return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le procès-verbal en ligne</li>';
  }

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
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

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de mise à disposition à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mise_dispo_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('restitution_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      EQUIP_LIST: this.buildEquipList(bon.equipments ?? []),
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de restitution à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'restitution_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendSignatureConfirmation(bon: NotificationBon, type: 'mise_disposition' | 'restitution'): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const templateId = type === 'restitution' ? 'confirmation_restitution' : 'confirmation_mise_disposition';
    const typLabel = type === 'restitution' ? 'restitution' : 'mise à disposition';

    const html = await this.templatesService.renderTemplate(templateId, {
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      TYPE_LABEL: typLabel,
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Confirmation de signature — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'confirmation',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : 'SMTP non configuré',
      },
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('pv_cloture_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      NOT_RETURNED_LIST: this.buildNotReturnedList(bon.equipments ?? []),
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Procès-verbal d'équipements non restitués à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'pv_cloture_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
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
    if (itStaff.length === 0) return;

    const html = await this.templatesService.renderTemplate('contestation_alert', {
      USER_NAME: escapeHtml(userName),
      REFERENCE: escapeHtml(reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      CONTESTATION_MESSAGE: escapeHtml(message),
    });

    await Promise.allSettled(
      itStaff.map((staff) =>
        this.sendEmail(
          staff.email,
          `[CONTESTATION] [${reference}] ${escapeHtml(userName)} conteste son bon — ${filialeNom}`,
          html,
        ),
      ),
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: itStaff.map((s) => s.email).join(', '),
        type: 'contestation_alert',
        status: 'sent',
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

    const ok = await this.sendEmail(
      collaborateur.email,
      `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: collaborateur.email,
        type: 'contestation_resolution',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Cancel / MarkFound ──────────────────────────────────────────────────────

  async sendCancellationNotice(bon: NotificationBon): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#374151;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#dc2626">Bon annulé — ${escapeHtml(bon.reference)}</h2>
  <p>${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
  <p>Nous vous informons que le bon de mise à disposition <strong>${escapeHtml(bon.reference)}</strong>
  (${escapeHtml(filialeNom)}) a été <strong>annulé</strong>.</p>
  <p>Si vous avez des questions, veuillez contacter votre service informatique.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:12px;color:#94a3b8">Groupe Livio — notification automatique</p>
</body></html>`;

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${escapeHtml(bon.reference)} — annulé`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'cancellation',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
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
        return `<li style="padding:6px 0;font-size:14px;color:#374151;list-style:none">${label}${serial}</li>`;
      })
      .join('\n');

    const equipList = equipLines
      ? equipLines
      : '<li style="padding:6px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le bon en ligne</li>';

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#374151;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#16a34a">Équipement(s) retrouvé(s) — ${escapeHtml(bon.reference)}</h2>
  <p>${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
  <p>Nous vous informons que le ou les équipements suivants, précédemment signalés comme non restitués
  sur le bon <strong>${escapeHtml(bon.reference)}</strong> (${escapeHtml(filialeNom)}),
  ont été <strong>retrouvés</strong> :</p>
  <ul style="padding:0;margin:16px 0">${equipList}</ul>
  <p>Si vous avez des questions, veuillez contacter votre service informatique.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:12px;color:#94a3b8">Groupe Livio — notification automatique</p>
</body></html>`;

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${escapeHtml(bon.reference)} — équipement(s) retrouvé(s)`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mark_found',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Cron: Rappels quotidiens ────────────────────────────────────────────────

  @Cron('0 9 * * 1-5') // Lundi–Vendredi à 9h
  async sendDailyReminders(): Promise<void> {
    this.logger.log('Cron rappels démarré');

    const remindersEnabled = await this.configService.get('notifications', 'reminders_enabled');
    if (remindersEnabled === 'false') return;

    const delayDays = parseInt(
      (await this.configService.get('notifications', 'reminder_delay_days')) ?? '3',
    );
    const maxReminders = parseInt(
      (await this.configService.get('notifications', 'max_reminders')) ?? '3',
    );

    const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000);

    const pendingBons = await this.prisma.bon.findMany({
      where: {
        status: { in: ['sent_mise_dispo', 'sent_restitution'] },
        updatedAt: { lt: cutoff },
      },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        signatures: { where: { signed: false } },
        notifications: {
          where: { type: 'reminder' },
          orderBy: { sentAt: 'desc' },
        },
      },
    });

    const appUrl = await this.getAppUrl();

    for (const bon of pendingBons) {
      try {
        const reminderCount = bon.notifications.filter((n) => n.type === 'reminder').length;
        if (reminderCount >= maxReminders) continue;

        const sig = bon.signatures.find((s) => !s.signed);
        if (!sig) continue;

        const filialeNom = bon.filiale?.displayName ?? '';
        const isRestitution = bon.status === 'sent_restitution';

        const html = await this.templatesService.renderTemplate('reminder', {
          TYPE_LABEL: isRestitution ? 'restitution' : 'mise à disposition',
          REFERENCE: escapeHtml(bon.reference),
          SIGNER_URL: `${appUrl}/signer/${sig.token}`,
          REMINDER_NUMBER: String(reminderCount + 1),
          MAX_REMINDERS: String(maxReminders),
          FILIALE_NOM: escapeHtml(filialeNom),
        });

        const ok = await this.sendEmail(
          bon.collaborateurEmail,
          `[RAPPEL] [${bon.reference}] Bon de ${isRestitution ? 'restitution' : 'mise à disposition'} à signer — ${filialeNom}`,
          html,
        );

        await this.prisma.notificationLog.create({
          data: {
            bonId: bon.id,
            recipientEmail: bon.collaborateurEmail,
            type: 'reminder',
            status: ok ? 'sent' : 'failed',
            reminderNumber: reminderCount + 1,
          },
        });
      } catch (err) {
        this.logger.error(`Erreur rappel bon ${bon.id} (${bon.reference}): ${err}`);
      }
    }

    this.logger.log(`Cron rappels terminé — ${pendingBons.length} bons traités`);
  }
}
