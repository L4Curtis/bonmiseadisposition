import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { NotificationBon } from '../common/types';
import type { CollaborateurInventoryItem } from '../reporting/inventory-collaborateur-aggregate';
import { resolveAppUrl } from './app-url';
import { findItAlertRecipients } from './it-alert-recipients';
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
  blockIfEmailMissing,
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
import { buildDepartureAlertMessage } from './messages/departure-alert-message';
import {
  buildCancellationNotice,
  buildMarkFoundNotice,
  buildUnilateralCloseNotice,
} from './messages/system-notice-emails';
import { sendTokenSignatureRequest, sendTemplatedNotification, sendPrebuiltNotice } from './senders/notification-senders';
import { runDailyReminders as runDailyRemindersJob, DailyRemindersOutcome } from './reminders/daily-reminders';
import { runRestitutionDueReminders as runRestitutionDueRemindersJob, RestitutionDueRemindersOutcome } from './reminders/restitution-due-reminders';
import { JobTrackerService } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';

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
    private readonly jobTracker: JobTrackerService,
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
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon,
      token,
      type: 'mise_dispo_request',
      templateId: 'mise_disposition_request',
      buildMessage: buildMiseDispositionRequestMessage,
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string): Promise<void> {
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon,
      token,
      type: 'restitution_request',
      templateId: 'restitution_request',
      buildMessage: buildRestitutionRequestMessage,
    });
  }

  async sendSignatureConfirmation(bon: NotificationBon, type: ConfirmationType): Promise<void> {
    const { templateId, vars, subject } = buildConfirmationMessage(bon, type);
    return sendTemplatedNotification(this.senderDeps(), {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'confirmation',
      templateId,
      vars,
      subject,
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string): Promise<void> {
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon,
      token,
      type: 'pv_cloture_request',
      templateId: 'pv_cloture_request',
      buildMessage: buildPvClotureRequestMessage,
    });
  }

  // ─── Rappel restitution prévue ──────────────────────────────────────────────
  // Envoyé une seule fois par bon (idempotence portée par le cron via
  // NotificationLog — voir runRestitutionDueReminders). Contrairement aux
  // autres rappels, ce message ne porte pas de lien de signature : il pointe
  // vers le portail collaborateur ({{PORTAIL_URL}} = getAppUrl() + '/mes-bons').

  async sendRestitutionDueReminder(bon: NotificationBon): Promise<boolean> {
    const recipientEmail = bon.collaborateur?.email ?? bon.collaborateurEmail;
    if (!recipientEmail) {
      await blockIfEmailMissing(this.prisma, this.logger, bon.id, recipientEmail, 'restitution_due_reminder');
      return false;
    }

    const appUrl = await this.getAppUrl();
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

  async sendContestationAlert(bon: NotificationBon, contestingUser: { displayName?: string; email?: string | null }, message: string): Promise<void> {
    // Tous les administrateurs et techniciens actifs (voir it-alert-recipients.ts) ;
    // un compte sans adresse délivrable est simplement écarté.
    const recipients = await findItAlertRecipients(this.prisma);
    if (recipients.length === 0) {
      const errorMessage = 'Aucun administrateur ni technicien actif avec une adresse email valide';
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
      recipients.map((email) => this.sendEmail(email, subject, html)),
    );
    const anyOk = results.some((r) => r.ok);
    const combinedError = results
      .filter((r) => !r.ok)
      .map((r) => r.error ?? "Erreur d'envoi inconnue")
      .join('; ');

    await logNotificationResult(this.prisma, {
      bonId: bon.id,
      recipientEmail: recipients.join(', '),
      type: 'contestation_alert',
      result: anyOk ? { ok: true } : { ok: false, error: combinedError },
    });
  }

  async sendContestationResolution(
    bon: NotificationBon,
    collaborateur: { email?: string | null },
    action: ContestationResolutionAction,
    resolutionMessage?: string,
  ): Promise<void> {
    // Une contestation reste possible sans adresse email : seul l'accusé de
    // réception par email est alors ignoré (le collaborateur a signé/contesté
    // en présentiel, il n'y a pas d'email à confirmer).
    const { templateId, vars, subject } = buildContestationResolutionMessage(bon, action, resolutionMessage);
    return sendTemplatedNotification(this.senderDeps(), {
      bonId: bon.id,
      recipientEmail: collaborateur.email,
      type: 'contestation_resolution',
      templateId,
      vars,
      subject,
    });
  }

  // ─── Départ d'un collaborateur (lot D1) ──────────────────────────────────────

  /**
   * Alerte récapitulative unique envoyée aux administrateurs et techniciens
   * actifs (même sélection que sendContestationAlert) quand la synchronisation LDAP
   * vient de désactiver un ou plusieurs comptes qui détiennent encore du
   * matériel. Un seul email pour tout le lot (pas un par collaborateur) —
   * l'appelant (LdapService / departure-notifications.ts) a déjà résolu la
   * liste et la déduplication (journal d'audit) avant d'appeler cette méthode.
   *
   * Ne journalise pas dans NotificationLog : contrairement aux autres emails,
   * cette alerte ne porte pas sur UN bon (bonId obligatoire dans
   * NotificationLog) mais sur plusieurs collaborateurs/bons — la traçabilité
   * de l'envoi est assurée en amont par l'appelant (AuditLog, action
   * `departure_notified`, un enregistrement par collaborateur notifié).
   *
   * Renvoie `true` si l'email est parti chez au moins un destinataire IT, pour
   * que l'appelant sache s'il peut marquer les collaborateurs comme notifiés
   * (sinon la prochaine synchronisation retentera l'envoi).
   */
  async sendDepartureAlert(candidates: readonly CollaborateurInventoryItem[]): Promise<boolean> {
    if (candidates.length === 0) return false;

    const appUrl = await this.getAppUrl();
    if (!appUrl) {
      this.logger.error(
        `Alerte départ non envoyée (${candidates.length} collaborateur(s) concerné(s)) : URL de l'application non configurée`,
      );
      return false;
    }

    const recipients = await findItAlertRecipients(this.prisma);
    if (recipients.length === 0) {
      this.logger.warn(
        `Alerte départ non envoyée (${candidates.length} collaborateur(s) concerné(s)) : aucun utilisateur IT actif avec une adresse email délivrable`,
      );
      return false;
    }

    const inventoryUrl = `${appUrl}/inventaire?vue=collaborateurs&compte=inactif`;
    const { vars, subject } = buildDepartureAlertMessage(candidates, inventoryUrl);
    const html = await this.templatesService.renderTemplate('departure_alert', vars);

    const results = await Promise.all(recipients.map((email) => this.sendEmail(email, subject, html)));
    const anyOk = results.some((r) => r.ok);
    if (!anyOk) {
      const combinedError = results.map((r) => r.error ?? "Erreur d'envoi inconnue").join('; ');
      this.logger.error(`Alerte départ : échec d'envoi à tous les destinataires IT (${combinedError})`);
    }
    return anyOk;
  }

  // ─── Cancel / MarkFound ──────────────────────────────────────────────────────

  async sendCancellationNotice(bon: NotificationBon): Promise<void> {
    const { html, subject } = buildCancellationNotice(bon);
    return sendPrebuiltNotice(this.senderDeps(), {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'cancellation',
      html,
      subject,
    });
  }

  async sendMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): Promise<void> {
    const { html, subject } = buildMarkFoundNotice(bon, equipmentIds);
    return sendPrebuiltNotice(this.senderDeps(), {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'mark_found',
      html,
      subject,
    });
  }

  // ─── Clôture unilatérale ─────────────────────────────────────────────────────

  async sendUnilateralCloseNotice(bon: NotificationBon, reason: string, newStatus: string): Promise<void> {
    const { html, subject } = buildUnilateralCloseNotice(bon, reason, newStatus);
    return sendPrebuiltNotice(this.senderDeps(), {
      bonId: bon.id,
      recipientEmail: bon.collaborateurEmail,
      type: 'unilateral_closure',
      html,
      subject,
    });
  }

  /** Dépendances explicites passées aux fonctions pures de ./senders. */
  private senderDeps() {
    return {
      prisma: this.prisma,
      logger: this.logger,
      templatesService: this.templatesService,
      sendEmail: (to: string, subject: string, html: string) => this.sendEmail(to, subject, html),
      getAppUrl: () => this.getAppUrl(),
    };
  }

  // ─── Cron: Rappels quotidiens ────────────────────────────────────────────────

  @Cron('0 9 * * 1-5', { timeZone: 'Europe/Paris' }) // Lundi–Vendredi à 9h (heure de Paris)
  async sendDailyReminders(): Promise<void> {
    try {
      await this.jobTracker.track(JOB_KEYS.SIGNATURE_REMINDERS, () => this.runDailyReminders());
    } catch (err) {
      // The cron package does not catch rejected promises — never let this
      // escape as an unhandledRejection
      this.logger.error(`Cron rappels en échec: ${(err as Error).stack ?? err}`);
    }
  }

  private async runDailyReminders(): Promise<DailyRemindersOutcome> {
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
      await this.jobTracker.track<RestitutionDueRemindersOutcome>(JOB_KEYS.RESTITUTION_REMINDER, () =>
        runRestitutionDueRemindersJob({
          configService: this.configService,
          prisma: this.prisma,
          logger: this.logger,
          getTransporter: () => this.getTransporter(),
          sendReminder: (bon) => this.sendRestitutionDueReminder(bon),
        }),
      );
    } catch (err) {
      // Le package cron ne rattrape pas les promesses rejetées — ne jamais
      // laisser fuir ceci en unhandledRejection.
      this.logger.error(`Cron rappel restitution en échec: ${(err as Error).stack ?? err}`);
    }
  }
}
