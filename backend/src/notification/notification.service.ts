import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
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
      tls: { rejectUnauthorized: false },
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

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: any, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const signerUrl = `${appUrl}/signer/${token}`;
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const dateMise = new Date(bon.dateMiseDisposition).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const equipList = (bon.equipments ?? [])
      .sort((a: any, b: any) => a.order - b.order)
      .map((eq: any) => {
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || 'Équipement';
        return `<li>${label}${eq.serialNumber ? ` (N° série : ${eq.serialNumber})` : ''}</li>`;
      })
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#1e40af;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">${filialeNom}</h1>
          <p style="color:#bfdbfe;margin:4px 0 0;font-size:14px">Bon de mise à disposition — À signer</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin-top:0">${civilite} ${bon.collaborateur?.displayName ?? ''},</p>
          <p>Dans le cadre de votre activité au sein de <strong>${filialeNom}</strong>, le service informatique vous remet du matériel à la date du <strong>${dateMise}</strong>.</p>
          <p>Veuillez prendre connaissance de la liste des équipements ci-dessous et signer électroniquement le bon de mise à disposition en cliquant sur le bouton ci-dessous :</p>

          <ul style="background:#f8fafc;border-radius:6px;padding:16px 16px 16px 32px;margin:16px 0">
            ${equipList || '<li>Voir le bon en ligne</li>'}
          </ul>

          <div style="text-align:center;margin:32px 0">
            <a href="${signerUrl}"
               style="background:#1e40af;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              ✍️ Signer le bon de mise à disposition
            </a>
          </div>

          <p style="font-size:13px;color:#64748b">Ce lien est valable 7 jours. Une connexion via votre compte Microsoft est requise pour signer.<br>Référence : <strong>${bon.reference}</strong></p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio<br>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
      </div>`;

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
        errorMessage: ok ? null : 'SMTP non configuré ou erreur d\'envoi',
      },
    });
  }

  async sendRestitutionRequest(bon: any, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const signerUrl = `${appUrl}/signer/${token}`;
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const equipList = (bon.equipments ?? [])
      .sort((a: any, b: any) => a.order - b.order)
      .map((eq: any) => {
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || 'Équipement';
        return `<li>${label}${eq.serialNumber ? ` (N° série : ${eq.serialNumber})` : ''}</li>`;
      })
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#7c3aed;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">${filialeNom}</h1>
          <p style="color:#ddd6fe;margin:4px 0 0;font-size:14px">Bon de restitution — À signer</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin-top:0">${civilite} ${bon.collaborateur?.displayName ?? ''},</p>
          <p>Le service informatique de <strong>${filialeNom}</strong> vous invite à signer le bon de <strong>restitution</strong> pour le matériel suivant :</p>
          <ul style="background:#f8fafc;border-radius:6px;padding:16px 16px 16px 32px;margin:16px 0">
            ${equipList || '<li>Voir le bon en ligne</li>'}
          </ul>
          <div style="text-align:center;margin:32px 0">
            <a href="${signerUrl}"
               style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              ✍️ Signer le bon de restitution
            </a>
          </div>
          <p style="font-size:13px;color:#64748b">Ce lien est valable 7 jours. Une connexion via votre compte Microsoft est requise.<br>Référence : <strong>${bon.reference}</strong></p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio</p>
        </div>
      </div>`;

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
        errorMessage: ok ? null : 'SMTP non configuré ou erreur d\'envoi',
      },
    });
  }

  async sendSignatureConfirmation(bon: any, type: 'mise_disposition' | 'restitution'): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const isRestitution = type === 'restitution';
    const typLabel = isRestitution ? 'restitution' : 'mise à disposition';
    const color = isRestitution ? '#7c3aed' : '#16a34a';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:${color};padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">✅ Document signé</h1>
          <p style="color:#d1fae5;margin:4px 0 0;font-size:14px">Bon de ${typLabel} — ${filialeNom}</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p>Votre bon de <strong>${typLabel}</strong> (réf. <strong>${bon.reference}</strong>) a bien été signé électroniquement.</p>
          <p style="font-size:13px;color:#64748b">Conservez ce message comme confirmation. Le document signé est archivé dans notre système.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio</p>
        </div>
      </div>`;

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
    const signerUrl = `${appUrl}/signer/${token}`;
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const notReturnedList = (bon.equipments ?? [])
      .filter((eq: any) => eq.notReturned)
      .sort((a: any, b: any) => a.order - b.order)
      .map((eq: any) => {
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || 'Équipement';
        return `<li>${label}${eq.serialNumber ? ` (N° série : ${eq.serialNumber})` : ''} — <em>${eq.notReturnedReason ?? 'Motif non précisé'}</em></li>`;
      })
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#dc2626;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">${filialeNom}</h1>
          <p style="color:#fecaca;margin:4px 0 0;font-size:14px">Procès-verbal d'équipements non restitués — À signer</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin-top:0">${civilite} ${bon.collaborateur?.displayName ?? ''},</p>
          <p>Le service informatique de <strong>${filialeNom}</strong> vous invite à prendre connaissance et à signer le procès-verbal d'équipements non restitués concernant le bon <strong>${bon.reference}</strong>.</p>
          <p>Les équipements suivants ont été déclarés non restitués :</p>
          <ul style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 16px 16px 32px;margin:16px 0">
            ${notReturnedList || '<li>Voir le procès-verbal en ligne</li>'}
          </ul>
          <div style="text-align:center;margin:32px 0">
            <a href="${signerUrl}"
               style="background:#dc2626;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              ✍️ Signer le procès-verbal
            </a>
          </div>
          <p style="font-size:13px;color:#64748b">Ce lien est valable 7 jours. Une connexion via votre compte Microsoft est requise.<br>Référence : <strong>${bon.reference}</strong></p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio<br>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
      </div>`;

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
        errorMessage: ok ? null : 'SMTP non configuré ou erreur d\'envoi',
      },
    });
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  /** Alerte email envoyée aux IT staff quand un collaborateur conteste son bon */
  async sendContestationAlert(bon: any, contestingUser: any, message: string): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const reference = bon.reference ?? '';
    const userName = contestingUser?.displayName ?? contestingUser?.email ?? '';

    // Récupérer les emails des IT staff actifs
    const itStaff = await this.prisma.user.findMany({
      where: { isItStaff: true, active: true },
      select: { email: true },
    });
    if (itStaff.length === 0) return;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#b91c1c;padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">⚠️ Contestation reçue</h1>
          <p style="color:#fecaca;margin:4px 0 0;font-size:14px">Bon ${reference} — ${filialeNom}</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin-top:0">Le collaborateur <strong>${userName}</strong> a contesté le bon <strong>${reference}</strong>.</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:16px 0">
            <p style="margin:0;font-size:14px;color:#7f1d1d"><strong>Motif :</strong></p>
            <p style="margin:8px 0 0;font-size:14px;color:#1e293b">${message}</p>
          </div>
          <p style="font-size:13px;color:#64748b">Connectez-vous à l'application pour consulter et traiter cette contestation.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio</p>
        </div>
      </div>`;

    for (const staff of itStaff) {
      await this.sendEmail(
        staff.email,
        `[CONTESTATION] [${reference}] ${userName} conteste son bon — ${filialeNom}`,
        html,
      );
    }

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: itStaff.map((s) => s.email).join(', '),
        type: 'contestation_alert',
        status: 'sent',
      },
    });
  }

  /** Email envoyé au collaborateur suite à la résolution de sa contestation */
  async sendContestationResolution(
    bon: any,
    collaborateur: any,
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const isResolved = action === 'resolved';
    const color = isResolved ? '#16a34a' : '#dc2626';
    const title = isResolved ? '✅ Contestation prise en compte' : '❌ Contestation non retenue';
    const subtitle = isResolved
      ? 'Votre contestation a été examinée et prise en compte par le service IT.'
      : 'Votre contestation a été examinée mais n\'a pas pu être retenue.';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:${color};padding:24px 32px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">${title}</h1>
          <p style="color:#d1fae5;margin:4px 0 0;font-size:14px">Bon ${bon.reference} — ${filialeNom}</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p>${subtitle}</p>
          ${resolutionMessage ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:16px 0">
            <p style="margin:0;font-size:14px"><strong>Message du service IT :</strong></p>
            <p style="margin:8px 0 0;font-size:14px">${resolutionMessage}</p>
          </div>` : ''}
          <p style="font-size:13px;color:#64748b">Référence : <strong>${bon.reference}</strong></p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8;margin:0">Service informatique — Groupe Livio</p>
        </div>
      </div>`;

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

      // Find active unsigned signature token
      const sig = bon.signatures.find((s) => !s.signed);
      if (!sig) continue;

      const appUrl = await this.getAppUrl();
      const signerUrl = `${appUrl}/signer/${sig.token}`;
      const filialeNom = bon.filiale?.displayName ?? '';
      const isRestitution = bon.status === 'sent_restitution';
      const typLabel = isRestitution ? 'restitution' : 'mise à disposition';

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="background:#dc2626;padding:24px 32px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">⏰ Rappel — Document en attente de signature</h1>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
            <p>Ce message est un rappel. Votre bon de <strong>${typLabel}</strong> (réf. <strong>${bon.reference}</strong>) est toujours en attente de votre signature.</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${signerUrl}" style="background:#dc2626;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
                ✍️ Signer maintenant
              </a>
            </div>
            <p style="font-size:13px;color:#64748b">Rappel ${reminderCount + 1}/${maxReminders} — ${filialeNom}</p>
          </div>
        </div>`;

      const ok = await this.sendEmail(
        bon.collaborateurEmail,
        `[RAPPEL] [${bon.reference}] Bon de ${typLabel} à signer — ${filialeNom}`,
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
