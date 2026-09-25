import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from '../../templates/templates.service';
import { generateSignatureToken } from '../../common/tokens';
import { SendEmailResult, logNotificationResult, blockIfAppUrlMissing, blockIfEmailMissing } from '../notification-log';
import { buildReminderMessage } from '../messages/reminder-message';
import { SIGNATURE_LINK_BON_STATUSES } from '../../bons/bon-status';

// ─── Cron: Rappels quotidiens ────────────────────────────────────────────────
// Reads the SAME config category/keys as the admin UI (category "rappels",
// keys enabled / delay_1 / delay_2 / delay_3). Reminder N is sent once the
// bon has been pending for delay_N days — staggered, never on consecutive
// days unless configured that way. Couvre aussi les PV de non-restitution en
// attente de co-signature (partially_returned).

/** Délai (en jours) d'un palier de rappel, borné à un entier positif. */
export function parseDelay(raw: string | null, fallback: number): number {
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Durée de validité des liens (tokens.expiry_days, bornée 1–30, défaut 7). */
export async function getTokenValidityDays(configService: AppConfigService): Promise<number> {
  const raw = await configService.get('tokens', 'expiry_days');
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
export async function regenerateSignatureToken(
  prisma: PrismaService,
  configService: AppConfigService,
  logger: Logger,
  bonId: string,
  type: 'mise_disposition' | 'restitution' | 'pv_cloture',
): Promise<{ token: string }> {
  await prisma.signature.updateMany({
    where: { bonId, type, signed: false },
    data: { tokenExpiresAt: new Date(0) },
  });
  const validityDays = await getTokenValidityDays(configService);
  const sig = await prisma.signature.create({
    data: {
      bonId,
      type,
      token: generateSignatureToken(),
      tokenExpiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
      isInPerson: false,
      initiatedById: null,
    },
  });
  logger.log(`Rappel: token ${type} régénéré pour le bon ${bonId}`);
  return sig;
}

export interface DailyRemindersDeps {
  configService: AppConfigService;
  prisma: PrismaService;
  templatesService: TemplatesService;
  logger: Logger;
  getAppUrl: () => Promise<string>;
  getTransporter: () => Promise<nodemailer.Transporter | null>;
  sendEmail: (to: string, subject: string, html: string) => Promise<SendEmailResult>;
}

/** Résultat renvoyé au suivi des tâches planifiées (backend/src/monitoring) :
 *  'skipped' quand la tâche est sortie tôt sans rien envoyer (désactivée en
 *  configuration, SMTP non configuré) — tout le reste (y compris void, une
 *  fois les bons éligibles traités) compte comme un succès. */
export type DailyRemindersOutcome = 'skipped' | void;

export async function runDailyReminders(deps: DailyRemindersDeps): Promise<DailyRemindersOutcome> {
  const { configService, prisma, templatesService, logger, getAppUrl, getTransporter, sendEmail } = deps;
  logger.log('Cron rappels démarré');

  const remindersEnabled = await configService.get('rappels', 'enabled');
  if (remindersEnabled === 'false') {
    logger.log('Rappels désactivés par configuration');
    return 'skipped';
  }

  // Aucune régénération de token ni requête inutile si le SMTP n'est pas
  // configuré : sans cette garde, chaque jour ouvré créait une nouvelle
  // Signature + un NotificationLog "failed" par bon en attente.
  const transporter = await getTransporter();
  if (!transporter) {
    logger.warn('Cron rappels : SMTP non configuré, aucun rappel envoyé');
    return 'skipped';
  }

  const delays = [
    parseDelay(await configService.get('rappels', 'delay_1'), 3),
    parseDelay(await configService.get('rappels', 'delay_2'), 7),
    parseDelay(await configService.get('rappels', 'delay_3'), 14),
  ];
  const maxReminders = delays.length;
  const firstCutoff = new Date(Date.now() - delays[0] * 24 * 60 * 60 * 1000);

  const pendingBons = await prisma.bon.findMany({
    where: {
      // partially_returned inclus : PV de non-restitution (ou restitution
      // partielle) en attente de signature — sans rappel, ces bons restaient
      // bloqués en silence indéfiniment
      status: { in: [...SIGNATURE_LINK_BON_STATUSES] },
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

  const appUrl = await getAppUrl();
  let sentCount = 0;

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
        logger.debug(
          `Rappel ignoré pour le bon ${bon.id} (${bon.reference}) : signature présentielle en attente avec un token encore valide`,
        );
        continue;
      }

      // Vérifiées AVANT toute régénération de token : inutile de consommer
      // (et d'invalider) un token pour un rappel qui ne partira de toute
      // façon pas — adresse absente (collaborateur créé manuellement, signe
      // en présentiel) ou app_url non configurée.
      const recipientEmail = bon.collaborateurEmail;
      if (!recipientEmail) {
        await blockIfEmailMissing(prisma, logger, bon.id, recipientEmail, 'reminder', {
          reminderNumber: reminderCount + 1,
        });
        continue;
      }
      if (
        await blockIfAppUrlMissing(prisma, logger, appUrl, bon.id, recipientEmail, 'reminder', {
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
        const fresh = await regenerateSignatureToken(
          prisma,
          configService,
          logger,
          bon.id,
          sig.type as 'mise_disposition' | 'restitution' | 'pv_cloture',
        );
        sig = { ...sig, token: fresh.token } as typeof sig;
      }

      const filialeNom = bon.filiale?.displayName ?? '';
      const { vars, subject } = buildReminderMessage({
        reference: bon.reference,
        filialeNom,
        signerUrl: `${appUrl}/signer/${sig.token}`,
        reminderNumber: reminderCount + 1,
        maxReminders,
        docType: sig.type,
      });

      const html = await templatesService.renderTemplate('reminder', vars);
      const result = await sendEmail(recipientEmail, subject, html);
      if (result.ok) sentCount++;

      await logNotificationResult(prisma, {
        bonId: bon.id,
        recipientEmail,
        type: 'reminder',
        result,
        reminderNumber: reminderCount + 1,
      });
    } catch (err) {
      logger.error(`Erreur rappel bon ${bon.id} (${bon.reference}): ${err}`);
    }
  }

  logger.log(`Cron rappels terminé — ${pendingBons.length} bons éligibles, ${sentCount} rappels envoyés`);
}
