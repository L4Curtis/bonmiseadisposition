import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { NotificationBon } from '../common/types';
import { resolveAppUrl } from './app-url';
import {
  readSmtpSettings,
  readFromAddress,
  buildTransporterCacheKey,
  buildTransporter,
} from './transport/smtp-transport';
import {
  SendEmailResult,
  logNotificationResult,
  logFailedNotification,
  blockIfAppUrlMissing,
} from './notification-log';
import {
  buildMiseDispositionRequestMessage,
  buildRestitutionRequestMessage,
  buildPvClotureRequestMessage,
} from './messages/signature-request-messages';
import { buildConfirmationMessage, ConfirmationType } from './messages/confirmation-messages';
import { buildRestitutionDueReminderMessage } from './messages/restitution-due-reminder-message';
import {
  buildContestationAlertMessage,
  buildContestationResolutionMessage,
  ContestationResolutionAction,
} from './messages/contestation-messages';
import {
  buildCancellationNotice,
  buildMarkFoundNotice,
  buildUnilateralCloseNotice,
} from './messages/system-notice-emails';
import { runDailyReminders as runDailyRemindersJob } from './reminders/daily-reminders';
import { runRestitutionDueReminders as runRestitutionDueRemindersJob } from './reminders/restitution-due-reminders';

export type { SendEmailResult } from './notification-log';

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
    const settings = await readSmtpSettings(this.configService);
    if (!settings.host) return null;

    const cacheKey = buildTransporterCacheKey(settings);
    if (this.cachedTransporter && this.transporterCacheKey === cacheKey) {
      return this.cachedTransporter;
    }

    this.cachedTransporter = buildTransporter({ ...settings, host: settings.host });
    this.transporterCacheKey = cacheKey;
    return this.cachedTransporter;
  }

  private async getFromAddress(): Promise<string> {
    return readFromAddress(this.configService);
  }

  /** URL publique : general.app_url (base), sinon FRONTEND_URL — voir
   *  resolveAppUrl (app-url.ts) pour l'ordre de repli exact. En production,
   *  une chaîne vide (les deux sont absents) est journalisée ici. */
  private async getAppUrl(): Promise<string> {
    const configured = await this.configService.get('general', 'app_url');
    const url = resolveAppUrl(configured, process.env);
    if (!url) {
      this.logger.error("URL de l'application (general.app_url ou FRONTEND_URL) non configurée en production");
    }
    return url;
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

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await blockIfAppUrlMissing(this.prisma, this.logger, appUrl, bon.id, bon.collaborateurEmail, 'mise_dispo_request')) {
      return;
    }

    const { vars, subject } = buildMiseDispositionRequestMessage(bon, `${appUrl}/signer/${token}`);
    const html = await this.templatesService.renderTemplate('mise_disposition_request', vars);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'mise_dispo_request',
      result,
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await blockIfAppUrlMissing(this.prisma, this.logger, appUrl, bon.id, bon.collaborateurEmail, 'restitution_request')) {
      return;
    }

    const { vars, subject } = buildRestitutionRequestMessage(bon, `${appUrl}/signer/${token}`);
    const html = await this.templatesService.renderTemplate('restitution_request', vars);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'restitution_request',
      result,
    });
  }

  async sendSignatureConfirmation(bon: NotificationBon, type: ConfirmationType): Promise<void> {
    const { templateId, vars, subject } = buildConfirmationMessage(bon, type);
    const html = await this.templatesService.renderTemplate(templateId, vars);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'confirmation',
      result,
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    if (await blockIfAppUrlMissing(this.prisma, this.logger, appUrl, bon.id, bon.collaborateurEmail, 'pv_cloture_request')) {
      return;
    }

    const { vars, subject } = buildPvClotureRequestMessage(bon, `${appUrl}/signer/${token}`);
    const html = await this.templatesService.renderTemplate('pv_cloture_request', vars);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'pv_cloture_request',
      result,
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

    if (await blockIfAppUrlMissing(this.prisma, this.logger, appUrl, bon.id, recipientEmail, 'restitution_due_reminder')) {
      return false;
    }

    const { vars, subject } = buildRestitutionDueReminderMessage(bon, appUrl);
    const html = await this.templatesService.renderTemplate('restitution_due_reminder', vars);
    const result = await this.sendEmail(recipientEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail,
      type: 'restitution_due_reminder',
      result,
    });

    return result.ok;
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  async sendContestationAlert(bon: NotificationBon, contestingUser: { displayName?: string; email?: string }, message: string): Promise<void> {
    const itStaff = await this.prisma.user.findMany({
      where: { isItStaff: true, active: true },
      select: { email: true },
    });
    if (itStaff.length === 0) {
      const errorMessage = 'Aucun utilisateur IT actif';
      this.logger.warn(`Alerte contestation non envoyée (bon ${bon.reference}) : ${errorMessage}`);
      await logFailedNotification(this.prisma, {
        bonId: bon.id,
        recipientEmail: '',
        type: 'contestation_alert',
        errorMessage,
      });
      return;
    }

    const { vars, subject } = buildContestationAlertMessage(bon, contestingUser, message);
    const html = await this.templatesService.renderTemplate('contestation_alert', vars);

    const results = await Promise.all(
      itStaff.map((staff) => this.sendEmail(staff.email, subject, html)),
    );
    const anyOk = results.some((r) => r.ok);
    const combinedError = results
      .filter((r) => !r.ok)
      .map((r) => r.error ?? "Erreur d'envoi inconnue")
      .join('; ');

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: itStaff.map((s) => s.email).join(', '),
      type: 'contestation_alert',
      result: anyOk ? { ok: true } : { ok: false, error: combinedError },
    });
  }

  async sendContestationResolution(
    bon: NotificationBon,
    collaborateur: { email: string },
    action: ContestationResolutionAction,
    resolutionMessage?: string,
  ): Promise<void> {
    const { templateId, vars, subject } = buildContestationResolutionMessage(bon, action, resolutionMessage);
    const html = await this.templatesService.renderTemplate(templateId, vars);
    const result = await this.sendEmail(collaborateur.email, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: collaborateur.email,
      type: 'contestation_resolution',
      result,
    });
  }

  // ─── Cancel / MarkFound ──────────────────────────────────────────────────────

  async sendCancellationNotice(bon: NotificationBon): Promise<void> {
    const { html, subject } = buildCancellationNotice(bon);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'cancellation',
      result,
    });
  }

  async sendMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): Promise<void> {
    const { html, subject } = buildMarkFoundNotice(bon, equipmentIds);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'mark_found',
      result,
    });
  }

  // ─── Clôture unilatérale ─────────────────────────────────────────────────────

  async sendUnilateralCloseNotice(bon: NotificationBon, reason: string, newStatus: string): Promise<void> {
    const { html, subject } = buildUnilateralCloseNotice(bon, reason, newStatus);
    const result = await this.sendEmail(bon.collaborateurEmail, subject, html);

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'unilateral_closure',
      result,
    });
  }

  // ─── Cron: Rappels quotidiens ────────────────────────────────────────────────

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
    return runDailyRemindersJob({
      configService: this.configService,
      prisma: this.prisma,
      templatesService: this.templatesService,
      logger: this.logger,
      getAppUrl: () => this.getAppUrl(),
      getTransporter: () => this.getTransporter(),
      sendEmail: (to, subject, html) => this.sendEmail(to, subject, html),
    });
  }

  // ─── Cron: Rappel avant restitution prévue ───────────────────────────────────

  @Cron('0 9 * * *', { name: 'restitution-due-reminder', timeZone: 'Europe/Paris' }) // Tous les jours à 9h (heure de Paris)
  async runRestitutionDueReminders(): Promise<void> {
    try {
      await runRestitutionDueRemindersJob({
        configService: this.configService,
        prisma: this.prisma,
        logger: this.logger,
        getTransporter: () => this.getTransporter(),
        sendReminder: (bon) => this.sendRestitutionDueReminder(bon),
      });
    } catch (err) {
      // Le package cron ne rattrape pas les promesses rejetées — ne jamais
      // laisser fuir ceci en unhandledRejection.
      this.logger.error(`Cron rappel restitution en échec: ${(err as Error).stack ?? err}`);
    }
  }
}
