import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { ReopenedDocument } from '../contracts/contestations';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { NotificationBon } from '../common/types';
import { canSendLink } from '../common/can-send-link';
import type { CollaborateurInventoryItem } from '../reporting/inventory-collaborateur-aggregate';
import type { LinkRequestAlert } from '../signature/link-request';
import { resolveAppUrl } from './app-url';
import { portalUrl } from './app-links';
import { findItAlertRecipients } from './it-alert-recipients';
import { sendItAlert } from './it-alerts';
import { readSmtpSettings, readFromAddress, buildTransporterCacheKey, buildTransporter } from './transport/smtp-transport';
import {
  SendEmailResult,
  logNotificationResult,
  logFailedNotification,
  blockIfAppUrlMissing,
  truncateErrorMessage,
} from './notification-log';
import { logRefusedRecipient } from './collaborator-recipient';
import { loadNotificationBon, loadRejectionContext, loadSignedDocumentAttachment } from './notification-data';
import {
  buildMiseDispositionRequestMessage,
  buildRestitutionRequestMessage,
  buildPvClotureRequestMessage,
  RequestMessageOptions,
} from './messages/signature-request-messages';
import { buildConfirmationMessage, ConfirmationType } from './messages/confirmation-messages';
import { buildRestitutionDueReminderMessage } from './messages/restitution-due-reminder-message';
import {
  buildContestationAlertMessage,
  buildContestationResolutionMessage,
  ContestationResolutionAction,
} from './messages/contestation-messages';
import { buildDepartureAlertMessage } from './messages/departure-alert-message';
import { buildLinkRequestAlert } from './messages/link-request-alert-message';
import {
  buildCancellationNotice,
  buildClosedWithoutSignatureNotice,
  buildHandoverWithoutSignatureNotice,
  buildMarkFoundNotice,
  buildBonReplacedNotice,
  TemplatedEmail,
} from './messages/system-notice-emails';
import {
  EmailAttachment,
  sendCollaboratorEmail,
  sendTokenSignatureRequest,
} from './senders/notification-senders';
import { runDailyReminders as runDailyRemindersJob, DailyRemindersOutcome } from './reminders/daily-reminders';
import { runRestitutionDueReminders as runRestitutionDueRemindersJob, RestitutionDueRemindersOutcome } from './reminders/restitution-due-reminders';
import { JobTrackerService } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';

export type { SendEmailResult } from './notification-log';

/**
 * Tous les emails de l'application : demandes de signature, confirmations,
 * rappels, informations au collaborateur, alertes à l'équipe informatique.
 * Chaque envoi (ou non-envoi motivé) laisse une ligne dans le journal du bon
 * (NotificationLog). Les emails qui suivent une action du cycle de vie sont
 * déclenchés par les événements du domaine (listeners/bon-events.listener.ts).
 */
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
  // La clé de cache dérive de la configuration SMTP courante : un changement
  // de configuration reconstruit le transport.

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const settings = await readSmtpSettings(this.configService);
    if (!settings.host) return null;
    const cacheKey = buildTransporterCacheKey(settings);
    if (this.cachedTransporter && this.transporterCacheKey === cacheKey) return this.cachedTransporter;
    this.cachedTransporter = buildTransporter({ ...settings, host: settings.host });
    this.transporterCacheKey = cacheKey;
    return this.cachedTransporter;
  }

  /** URL publique : general.app_url, sinon FRONTEND_URL (voir resolveAppUrl).
   *  En production, une chaîne vide (les deux absents) est journalisée. */
  private async getAppUrl(): Promise<string> {
    const url = resolveAppUrl(await this.configService.get('general', 'app_url'), process.env);
    if (!url) this.logger.error("URL de l'application (general.app_url ou FRONTEND_URL) non configurée en production");
    return url;
  }

  async sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]): Promise<SendEmailResult> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        this.logger.warn(`Email non envoyé (SMTP non configuré) → ${to}: ${subject}`);
        return { ok: false, error: 'SMTP non configuré' };
      }
      const from = await readFromAddress(this.configService);
      if (!from) {
        const error = 'Expéditeur SMTP (smtp.from) non configuré';
        this.logger.error(error);
        return { ok: false, error };
      }
      await transporter.sendMail({ from, to, subject, html, ...(attachments?.length ? { attachments } : {}) });
      this.logger.log(`Email envoyé → ${to}: ${subject}`);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erreur envoi email → ${to}: ${error}`);
      return { ok: false, error };
    }
  }

  /** Dépendances explicites passées aux fonctions de ./senders. */
  private senderDeps() {
    return {
      prisma: this.prisma,
      logger: this.logger,
      templatesService: this.templatesService,
      sendEmail: (to: string, subject: string, html: string, attachments?: EmailAttachment[]) =>
        this.sendEmail(to, subject, html, attachments),
      getAppUrl: () => this.getAppUrl(),
    };
  }

  // ─── Demandes de signature (adresse retenue par l'appelant) ─────────────────

  async sendMiseDispositionRequest(bon: NotificationBon, token: string, options: RequestMessageOptions = {}): Promise<void> {
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon, token, type: 'mise_dispo_request', templateId: 'mise_disposition_request', buildMessage: buildMiseDispositionRequestMessage, options,
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string, options: RequestMessageOptions = {}): Promise<void> {
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon, token, type: 'restitution_request', templateId: 'restitution_request', buildMessage: buildRestitutionRequestMessage, options,
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string, options: RequestMessageOptions = {}): Promise<void> {
    return sendTokenSignatureRequest(this.senderDeps(), {
      bon, token, type: 'pv_cloture_request', templateId: 'pv_cloture_request', buildMessage: buildPvClotureRequestMessage, options,
    });
  }

  // ─── Emails au collaborateur (adresse actuelle du compte, compte actif) ─────

  /**
   * Confirmation de signature (R-036) : le document signé, ses équipements, un
   * lien vers le portail, et le PDF signé en pièce jointe s'il reste d'une
   * taille raisonnable.
   */
  async sendSignatureConfirmation(bonId: string, documentType: ConfirmationType): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, bonId);
    if (!bon) return;
    const appUrl = await this.getAppUrl();
    return sendCollaboratorEmail(this.senderDeps(), {
      bonId, type: 'confirmation', documentType,
      build: async () => {
        const { templateId, vars, subject } = buildConfirmationMessage(bon, documentType, appUrl);
        const attachment = await loadSignedDocumentAttachment(this.prisma, bonId, documentType);
        return { subject, html: await this.templatesService.renderTemplate(templateId, vars), attachments: attachment ? [attachment] : [] };
      },
    });
  }

  /** Email d'un modèle personnalisable (version de l'administration, sinon
   *  le modèle par défaut), prêt à partir. */
  private async renderNotice(message: TemplatedEmail): Promise<{ subject: string; html: string }> {
    return { subject: message.subject, html: await this.templatesService.renderTemplate(message.templateId, message.vars) };
  }

  /** Email « bon annulé » avec son motif (R-013). */
  async sendCancellationNotice(bon: NotificationBon, reason = ''): Promise<void> {
    return sendCollaboratorEmail(this.senderDeps(), { bonId: bon.id, type: 'cancellation', build: () => this.renderNotice(buildCancellationNotice(bon, reason)) });
  }

  /** Email « bon annulé » d'après l'événement : le bon est relu en base. */
  async sendCancellationNoticeFor(bonId: string, reason: string): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, bonId);
    if (bon) await this.sendCancellationNotice(bon, reason);
  }

  /** Email « remise constatée sans signature » : le bon est En cours (R-014). */
  async sendHandoverWithoutSignatureNotice(bonId: string, reason: string): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, bonId);
    if (!bon) return;
    const appUrl = await this.getAppUrl();
    return sendCollaboratorEmail(this.senderDeps(), {
      bonId, type: 'handover_without_signature', build: () => this.renderNotice(buildHandoverWithoutSignatureNotice(bon, reason, portalUrl(appUrl))),
    });
  }

  /** Email « bon clôturé sans signature » : le bon est Clôturé (R-014). */
  async sendClosedWithoutSignatureNotice(bonId: string, reason: string, previousStatus: string): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, bonId);
    if (!bon) return;
    const appUrl = await this.getAppUrl();
    return sendCollaboratorEmail(this.senderDeps(), {
      bonId, type: 'unilateral_closure', build: () => this.renderNotice(buildClosedWithoutSignatureNotice(bon, reason, previousStatus, portalUrl(appUrl))),
    });
  }

  /**
   * Ancien point d'entrée des deux gestes sans signature, gardé pour les
   * appelants : il envoie l'email juste selon le résultat (En cours = remise
   * constatée ; sinon clôture).
   * @deprecated les emails suivent les événements `bon.handover_without_signature`
   * et `bon.closed_without_signature` (listeners/bon-events.listener.ts).
   */
  async sendUnilateralCloseNotice(bon: NotificationBon, reason: string, newStatus: string): Promise<void> {
    if (newStatus === 'active') return this.sendHandoverWithoutSignatureNotice(bon.id, reason);
    return this.sendClosedWithoutSignatureNotice(bon.id, reason, bon.status ?? 'sent_restitution');
  }

  /** Email « bon remplacé » : le bon corrigé est signé, l'original est
   *  clôturé comme remplacé (événement `bon.replaced`). */
  async sendBonReplacedNotice(bonId: string, replacementReference: string): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, bonId);
    if (!bon) return;
    const appUrl = await this.getAppUrl();
    return sendCollaboratorEmail(this.senderDeps(), {
      bonId, type: 'contestation_resolution', build: () => this.renderNotice(buildBonReplacedNotice(bon, replacementReference, portalUrl(appUrl))),
    });
  }

  async sendMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): Promise<void> {
    return sendCollaboratorEmail(this.senderDeps(), { bonId: bon.id, type: 'mark_found', build: () => this.renderNotice(buildMarkFoundNotice(bon, equipmentIds)) });
  }

  // ─── Rappel avant restitution prévue ────────────────────────────────────────
  // Un seul par bon (idempotence portée par le cron via NotificationLog). Pas
  // de lien de signature : il mène au portail du collaborateur.

  async sendRestitutionDueReminder(bon: NotificationBon & { collaborateur?: { active?: boolean; email?: string | null } | null }): Promise<boolean> {
    const recipient = canSendLink({ active: bon.collaborateur?.active ?? true, email: bon.collaborateur?.email ?? bon.collaborateurEmail });
    if (!recipient.allowed) {
      await logRefusedRecipient(this.prisma, { bonId: bon.id, type: 'restitution_due_reminder', refusal: recipient });
      return false;
    }
    const appUrl = await this.getAppUrl();
    if (await blockIfAppUrlMissing(this.prisma, this.logger, appUrl, bon.id, recipient.email, 'restitution_due_reminder')) {
      return false;
    }
    const { vars, subject } = buildRestitutionDueReminderMessage(bon, appUrl);
    const html = await this.templatesService.renderTemplate('restitution_due_reminder', vars);
    const result = await this.sendEmail(recipient.email, subject, html);
    await logNotificationResult(this.prisma, { bonId: bon.id, recipientEmail: recipient.email, type: 'restitution_due_reminder', result });
    return result.ok;
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  /** Alerte à l'équipe informatique, avec un lien direct vers le bon (R-035). */
  async sendContestationAlert(bon: NotificationBon, contestingUser: { displayName?: string; email?: string | null }, message: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const { vars, subject } = buildContestationAlertMessage(bon, contestingUser, message, appUrl);
    const html = await this.templatesService.renderTemplate('contestation_alert', vars);
    await sendItAlert(this.senderDeps(), { bonId: bon.id, bonReference: bon.reference, type: 'contestation_alert', subject, html });
  }

  /**
   * Réponse à une contestation, envoyée comme tout email au collaborateur : à
   * l'adresse ACTUELLE de son compte, jamais à un compte désactivé (ligne
   * « non envoyé »). `_contestant` est gardé pour les appelants : le
   * destinataire est relu en base. Fondée : `replacement` est le bon corrigé,
   * que l'email nomme (R-050) ; `reopenedDocument`, le document que l'IT
   * corrige sur le bon d'origine puis renvoie à signer (restitution ou PV).
   */
  async sendContestationResolution(
    bon: NotificationBon,
    _contestant: { email?: string | null },
    action: ContestationResolutionAction,
    resolutionMessage?: string,
    replacement?: { reference: string } | null,
    reopenedDocument?: ReopenedDocument | null,
  ): Promise<void> {
    // « Non retenue » : dire ce qui reste valable, et joindre le lien du
    // document encore à signer (jamais « tel qu'il a été signé » à tort).
    const rejection = action === 'rejected' ? await loadRejectionContext(this.prisma, bon.id, await this.getAppUrl()) : null;
    const { templateId, vars, subject } = buildContestationResolutionMessage(
      bon, action, resolutionMessage, replacement, reopenedDocument, rejection,
    );
    return sendCollaboratorEmail(this.senderDeps(), {
      bonId: bon.id,
      type: 'contestation_resolution',
      build: async () => ({ subject, html: await this.templatesService.renderTemplate(templateId, vars) }),
    });
  }

  // ─── Nouveau lien demandé (R-058) ───────────────────────────────────────────

  /**
   * Lance l'alerte « nouveau lien demandé » sans l'attendre (la route répond
   * tout de suite). Un échec imprévu est journalisé et tracé dans le journal
   * du bon ; les échecs d'envoi SMTP le sont déjà par sendItAlert.
   */
  queueLinkRequestAlert(alert: LinkRequestAlert): void {
    this.sendLinkRequestAlert(alert).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Alerte « nouveau lien demandé » (bon ${alert.bonId}) non envoyée : ${message}`);
      await logFailedNotification(this.prisma, {
        bonId: alert.bonId, recipientEmail: '', type: 'link_request_alert', errorMessage: truncateErrorMessage(message),
      }).catch(() => undefined);
    });
  }

  /** Alerte à l'équipe informatique : un collaborateur demande un nouveau lien. */
  async sendLinkRequestAlert(alert: LinkRequestAlert): Promise<void> {
    const bon = await loadNotificationBon(this.prisma, alert.bonId);
    if (!bon) return;
    const { subject, html } = await this.renderNotice(buildLinkRequestAlert(bon, alert, await this.getAppUrl()));
    await sendItAlert(this.senderDeps(), { bonId: bon.id, bonReference: bon.reference, type: 'link_request_alert', subject, html });
  }

  // ─── Départ d'un collaborateur ───────────────────────────────────────────────

  /**
   * Alerte récapitulative unique à l'équipe informatique quand la
   * synchronisation de l'annuaire désactive des comptes qui détiennent encore
   * des équipements. Non journalisée dans NotificationLog (elle ne porte pas
   * sur UN bon) : l'appelant trace l'envoi dans l'audit. Renvoie `true` si
   * l'email est parti chez au moins un destinataire.
   */
  async sendDepartureAlert(candidates: readonly CollaborateurInventoryItem[]): Promise<boolean> {
    if (candidates.length === 0) return false;
    const appUrl = await this.getAppUrl();
    if (!appUrl) {
      this.logger.error(`Alerte départ non envoyée (${candidates.length} collaborateur(s)) : URL de l'application non configurée`);
      return false;
    }
    const recipients = await findItAlertRecipients(this.prisma);
    if (recipients.length === 0) {
      this.logger.warn(`Alerte départ non envoyée (${candidates.length} collaborateur(s)) : aucun utilisateur IT actif avec une adresse délivrable`);
      return false;
    }
    const { vars, subject } = buildDepartureAlertMessage(candidates, `${appUrl}/inventaire?vue=collaborateurs&compte=inactif`);
    const html = await this.templatesService.renderTemplate('departure_alert', vars);
    const results = await Promise.all(recipients.map((email) => this.sendEmail(email, subject, html)));
    const anyOk = results.some((r) => r.ok);
    if (!anyOk) {
      this.logger.error(`Alerte départ : échec d'envoi à tous les destinataires IT (${results.map((r) => r.error).join('; ')})`);
    }
    return anyOk;
  }

  // ─── Tâches planifiées ───────────────────────────────────────────────────────

  @Cron('0 9 * * 1-5', { timeZone: 'Europe/Paris' }) // du lundi au vendredi à 9 h, heure de Paris
  async sendDailyReminders(): Promise<void> {
    try {
      await this.jobTracker.track(JOB_KEYS.SIGNATURE_REMINDERS, () => this.runDailyReminders());
    } catch (err) {
      // Le paquet cron ne rattrape pas les promesses rejetées.
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

  @Cron('0 9 * * *', { name: 'restitution-due-reminder', timeZone: 'Europe/Paris' }) // tous les jours à 9 h, heure de Paris
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
      this.logger.error(`Cron rappel restitution en échec: ${(err as Error).stack ?? err}`);
    }
  }
}
