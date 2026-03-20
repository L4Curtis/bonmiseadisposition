import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';

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

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ─── Transport ──────────────────────────────────────────────────────────────

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const host = await this.configService.get('smtp', 'host');
    const port = await this.configService.get('smtp', 'port');
    const user = await this.configService.get('smtp', 'user');
    const pass = await this.configService.get('smtp', 'password');
    const secure = await this.configService.get('smtp', 'secure');

    if (!host) return null;

    return nodemailer.createTransport({
      host,
      port: port ? parseInt(port) : 587,
      secure: secure === 'true',
      auth: user ? { user, pass: pass || '' } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    });
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

  private buildEquipList(equipments: any[]): string {
    const items = (equipments ?? [])
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || 'Équipement';
        const serial = eq.serialNumber
          ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${eq.serialNumber})</span>`
          : '';
        return `<li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le bon en ligne</li>';
  }

  private buildNotReturnedList(equipments: any[]): string {
    const items = (equipments ?? [])
      .filter((eq) => eq.notReturned)
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || 'Équipement';
        const serial = eq.serialNumber
          ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : ${eq.serialNumber})</span>`
          : '';
        const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${eq.notReturnedReason ?? 'Motif non précisé'}</span>`;
        return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#94a3b8;list-style:none">Voir le procès-verbal en ligne</li>';
  }

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: any, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const dateMise = new Date(bon.dateMiseDisposition).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const html = await this.templatesService.renderTemplate('mise_disposition_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: bon.collaborateur?.displayName ?? '',
      FILIALE_NOM: filialeNom,
      DATE_MISE_DISPO: dateMise,
      REFERENCE: bon.reference,
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

  async sendRestitutionRequest(bon: any, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('restitution_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: bon.collaborateur?.displayName ?? '',
      FILIALE_NOM: filialeNom,
      REFERENCE: bon.reference,
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

  async sendSignatureConfirmation(bon: any, type: 'mise_disposition' | 'restitution'): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const templateId = type === 'restitution' ? 'confirmation_restitution' : 'confirmation_mise_disposition';
    const typLabel = type === 'restitution' ? 'restitution' : 'mise à disposition';

    const html = await this.templatesService.renderTemplate(templateId, {
      FILIALE_NOM: filialeNom,
      REFERENCE: bon.reference,
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

  async sendPvClotureRequest(bon: any, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('pv_cloture_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: bon.collaborateur?.displayName ?? '',
      FILIALE_NOM: filialeNom,
      REFERENCE: bon.reference,
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
        type: 'restitution_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  async sendContestationAlert(bon: any, contestingUser: any, message: string): Promise<void> {
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
      REFERENCE: reference,
      FILIALE_NOM: filialeNom,
      CONTESTATION_MESSAGE: escapeHtml(message),
    });

    await Promise.all(
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
    bon: any,
    collaborateur: any,
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const templateId = action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected';

    const html = await this.templatesService.renderTemplate(templateId, {
      REFERENCE: bon.reference,
      FILIALE_NOM: filialeNom,
      RESOLUTION_MESSAGE: resolutionMessage ? escapeHtml(resolutionMessage) : '',
    });

    await this.sendEmail(
      collaborateur.email,
      `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
      html,
    );
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

    for (const bon of pendingBons) {
      const reminderCount = bon.notifications.filter((n) => n.type === 'reminder').length;
      if (reminderCount >= maxReminders) continue;

      const sig = bon.signatures.find((s) => !s.signed);
      if (!sig) continue;

      const appUrl = await this.getAppUrl();
      const filialeNom = bon.filiale?.displayName ?? '';
      const isRestitution = bon.status === 'sent_restitution';

      const html = await this.templatesService.renderTemplate('reminder', {
        TYPE_LABEL: isRestitution ? 'restitution' : 'mise à disposition',
        REFERENCE: bon.reference,
        SIGNER_URL: `${appUrl}/signer/${sig.token}`,
        REMINDER_NUMBER: String(reminderCount + 1),
        MAX_REMINDERS: String(maxReminders),
        FILIALE_NOM: filialeNom,
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
    }

    this.logger.log(`Cron rappels terminé — ${pendingBons.length} bons traités`);
  }
}
