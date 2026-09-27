import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from '../../templates/templates.service';
import { generateSignatureToken } from '../../common/tokens';
import { canSendLink } from '../../common/can-send-link';
import { SIGNATURE_LINK_BON_STATUSES } from '../../bons/bon-status';
import { LIVE_LINK_WHERE, invalidationData } from '../../signature/link-invalidation';
import { SendEmailResult, logNotificationResult, blockIfAppUrlMissing } from '../notification-log';
import { buildReminderMessage } from '../messages/reminder-message';
import { logRefusedRecipient, refusalLogReason } from '../collaborator-recipient';

// ─── Cron : rappels de signature ─────────────────────────────────────────────
// Réglages « rappels » (enabled, delay_1, delay_2, delay_3), les mêmes que
// l'écran d'administration. Règle (décision du 24/09, R-033) : TROIS rappels
// au plus PAR DOCUMENT (remise, restitution, PV), comptés depuis la demande de
// ce document (`Bon.awaitingSince`) : une nouvelle demande repart de zéro. Le
// rappel N part quand le document attend depuis delay_N jours.
// Aucun rappel vers un compte désactivé, sans adresse ou à l'adresse invalide
// (R-004, R-034) : une seule ligne par document, jamais une par jour.

type LinkDocument = 'mise_disposition' | 'restitution' | 'pv_cloture';
const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Nouveau lien pour un rappel quand le précédent a expiré (sinon le rappel
 * enverrait un lien mort). Le lien précédent est invalidé comme « remplacé ».
 * Reproduit SignatureService.generateToken : importer SignatureService ici
 * créerait un cycle de modules (SignatureModule consomme NotificationService).
 */
export async function regenerateSignatureToken(
  prisma: PrismaService,
  configService: AppConfigService,
  logger: Pick<Logger, 'log'>,
  bonId: string,
  type: LinkDocument,
): Promise<{ token: string }> {
  await prisma.signature.updateMany({
    where: { bonId, type, ...LIVE_LINK_WHERE },
    data: invalidationData('replaced'),
  });
  const validityDays = await getTokenValidityDays(configService);
  const sig = await prisma.signature.create({
    data: {
      bonId,
      type,
      token: generateSignatureToken(),
      tokenExpiresAt: new Date(Date.now() + validityDays * DAY_MS),
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
  now?: () => Date;
  /** Restreint les bons examinés (tests sur une base réelle : seuls leurs
   *  propres bons). Absent en production : tous les bons. */
  scope?: Prisma.BonWhereInput;
}

/** Résultat renvoyé au suivi des tâches planifiées : 'skipped' quand la tâche
 *  est sortie tôt sans rien envoyer (désactivée, SMTP non configuré). */
export type DailyRemindersOutcome = 'skipped' | void;

/** Bons dont un document attend la signature depuis au moins `cutoff`. */
function findPendingBons(prisma: PrismaService, cutoff: Date, scope: Prisma.BonWhereInput = {}) {
  const where: Prisma.BonWhereInput = {
    AND: [
      {
        status: { in: [...SIGNATURE_LINK_BON_STATUSES] },
        OR: [{ awaitingSince: { lt: cutoff } }, { awaitingSince: null, updatedAt: { lt: cutoff } }],
      },
      scope,
    ],
  };
  return prisma.bon.findMany({
    where,
    include: {
      filiale: true,
      collaborateur: { select: { id: true, displayName: true, email: true, active: true } },
      // Le lien en attente le plus récent, même expiré naturellement : il
      // porte le document attendu (le lien sera renouvelé). Les liens
      // invalidés volontairement (renvoi, guichet, clôture) sont exclus.
      signatures: {
        where: { type: { not: 'it_cachet' }, ...LIVE_LINK_WHERE },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      notifications: {
        where: { type: 'reminder' },
        select: { status: true, sentAt: true, documentType: true, errorMessage: true },
      },
    },
  });
}

type PendingBon = Awaited<ReturnType<typeof findPendingBons>>[number];

/** Journal des rappels de CE document depuis sa demande (un rappel ancien,
 *  sans document enregistré, compte pour le document en cours). */
function remindersOfDocument(bon: PendingBon, document: LinkDocument, since: Date) {
  return bon.notifications.filter(
    (n) => n.sentAt >= since && (n.documentType === document || n.documentType === null),
  );
}

interface ReminderContext {
  deps: DailyRemindersDeps;
  delays: number[];
  appUrl: string;
  now: Date;
}

/** Envoie, si c'est le moment, le rappel du document en attente d'un bon.
 *  Renvoie true si un email est parti. */
async function remindBon(ctx: ReminderContext, bon: PendingBon): Promise<boolean> {
  const { deps, delays, now } = ctx;
  const pending = bon.signatures[0];
  if (!pending) return false; // rien n'attend (ex. restitution partielle signée)
  const document = pending.type as LinkDocument;
  const since = bon.awaitingSince ?? bon.updatedAt;
  const logs = remindersOfDocument(bon, document, since);
  const sentCount = logs.filter((n) => n.status === 'sent').length;
  if (sentCount >= delays.length) return false;
  if ((now.getTime() - since.getTime()) / DAY_MS < delays[sentCount]) return false;

  // Lien au guichet encore valide : un technicien le fait peut-être signer en
  // ce moment ; le renouveler l'invaliderait. Pas de rappel aujourd'hui.
  if (pending.isInPerson && pending.tokenExpiresAt > now) return false;

  const recipient = canSendLink(bon.collaborateur);
  if (!recipient.allowed) {
    // Une seule ligne par document (« non envoyé », ou échec « adresse à
    // corriger »), pas une par jour.
    const reason = refusalLogReason(recipient);
    if (!logs.some((n) => n.status !== 'sent' && n.errorMessage === reason)) {
      await logRefusedRecipient(deps.prisma, { bonId: bon.id, type: 'reminder', refusal: recipient, documentType: document });
    }
    return false;
  }
  const reminderNumber = sentCount + 1;
  if (
    await blockIfAppUrlMissing(deps.prisma, deps.logger, ctx.appUrl, bon.id, recipient.email, 'reminder', {
      reminderNumber,
      documentType: document,
    })
  ) {
    return false;
  }

  // Lien expiré, ou lien au guichet expiré (jamais envoyé par email) : nouveau lien.
  const token =
    pending.isInPerson || pending.tokenExpiresAt <= now
      ? (await regenerateSignatureToken(deps.prisma, deps.configService, deps.logger, bon.id, document)).token
      : pending.token;

  const { vars, subject } = buildReminderMessage({
    reference: bon.reference,
    filialeNom: bon.filiale?.displayName ?? '',
    signerUrl: `${ctx.appUrl}/signer/${token}`,
    reminderNumber,
    maxReminders: delays.length,
    docType: document,
  });
  const html = await deps.templatesService.renderTemplate('reminder', vars);
  const result = await deps.sendEmail(recipient.email, subject, html);
  await logNotificationResult(deps.prisma, {
    bonId: bon.id, recipientEmail: recipient.email, type: 'reminder', result, reminderNumber, documentType: document,
  });
  return result.ok;
}

async function readDelays(configService: AppConfigService): Promise<number[]> {
  return [
    parseDelay(await configService.get('rappels', 'delay_1'), 3),
    parseDelay(await configService.get('rappels', 'delay_2'), 7),
    parseDelay(await configService.get('rappels', 'delay_3'), 14),
  ];
}

export async function runDailyReminders(deps: DailyRemindersDeps): Promise<DailyRemindersOutcome> {
  const { configService, prisma, logger } = deps;
  logger.log('Cron rappels démarré');

  if ((await configService.get('rappels', 'enabled')) === 'false') {
    logger.log('Rappels désactivés par configuration');
    return 'skipped';
  }
  // Sans SMTP, aucun lien renouvelé ni ligne de journal inutile.
  if (!(await deps.getTransporter())) {
    logger.warn('Cron rappels : SMTP non configuré, aucun rappel envoyé');
    return 'skipped';
  }

  const now = deps.now?.() ?? new Date();
  const delays = await readDelays(configService);
  const pendingBons = await findPendingBons(prisma, new Date(now.getTime() - delays[0] * DAY_MS), deps.scope);
  const ctx: ReminderContext = { deps, delays, appUrl: await deps.getAppUrl(), now };

  let sentCount = 0;
  for (const bon of pendingBons) {
    try {
      if (await remindBon(ctx, bon)) sentCount++;
    } catch (err) {
      logger.error(`Erreur rappel bon ${bon.id} (${bon.reference}): ${err}`);
    }
  }
  logger.log(`Cron rappels terminé — ${pendingBons.length} bons éligibles, ${sentCount} rappels envoyés`);
}
