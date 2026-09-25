import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationBon } from '../../common/types';
import { addDaysToIsoDate, isoDateToUtc, todayInParis } from '../../common/dates/paris';
import { RESTITUTION_START_BON_STATUSES } from '../../bons/bon-status';

/** Dernière milliseconde d'un jour, comptée depuis minuit. */
const LAST_MS_OF_DAY = 86_400_000 - 1;

// ─── Cron: Rappel avant restitution prévue ───────────────────────────────────
// Lit rappels.restitution_before_days (même catégorie que les rappels
// quotidiens — cf. ALLOWED_CONFIG_KEYS.rappels dans admin.controller.ts).
// Défaut 7 jours ; 0 désactive la fonctionnalité. Idempotence : seul un
// NotificationLog de type restitution_due_reminder au statut 'sent' exclut
// le bon de la requête ci-dessous (comme les rappels quotidiens) — un échec
// transitoire (SMTP down, app_url absente) ne doit PAS bloquer tout
// réessai les jours suivants. Un envoi RÉUSSI, en revanche, reste unique
// pour ce bon même si sa dateRestitution change ensuite (report,
// correction) : le filtre porte sur l'existence du log 'sent', pas sur la
// date courante — un seul rappel réussi par bon, par construction.

/** Comme parseDelay (daily-reminders.ts), mais 0 est une valeur valide
 *  (désactive la fonctionnalité) — parseDelay rejette tout n <= 0 au profit
 *  du fallback, ce qui est incorrect ici : 0 doit être respecté, pas
 *  remplacé par le défaut. */
export function parseNonNegativeInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Fenêtre [aujourd'hui, aujourd'hui + N jours] en date locale Europe/Paris,
 * fin de journée incluse. Bornes exprimées en UTC minuit/23:59:59.999 :
 * cohérent avec les colonnes @db.Date (date calendaire sans heure, stockée
 * comme minuit UTC), tout en calculant "aujourd'hui" sur le fuseau Paris.
 * `now` est injectable pour les tests (défaut : l'heure courante).
 */
export function getRestitutionWindow(beforeDays: number, now: Date = new Date()): { start: Date; end: Date } {
  const today = todayInParis(now);
  const start = isoDateToUtc(today);
  const end = new Date(isoDateToUtc(addDaysToIsoDate(today, beforeDays)).getTime() + LAST_MS_OF_DAY);
  return { start, end };
}

export interface RestitutionDueRemindersDeps {
  configService: AppConfigService;
  prisma: PrismaService;
  logger: Logger;
  getTransporter: () => Promise<nodemailer.Transporter | null>;
  /** Envoie le rappel pour un bon et journalise le résultat — réutilise
   *  NotificationService.sendRestitutionDueReminder (déjà testé isolément). */
  sendReminder: (bon: NotificationBon) => Promise<boolean>;
}

/** Résultat renvoyé au suivi des tâches planifiées (backend/src/monitoring) :
 *  'skipped' quand la tâche est sortie tôt sans rien envoyer (fonctionnalité
 *  désactivée, SMTP non configuré) — tout le reste compte comme un succès. */
export type RestitutionDueRemindersOutcome = 'skipped' | void;

export async function runRestitutionDueReminders(deps: RestitutionDueRemindersDeps): Promise<RestitutionDueRemindersOutcome> {
  const { configService, prisma, logger, getTransporter, sendReminder } = deps;
  logger.log('Cron rappel restitution démarré');

  const rawDays = await configService.get('rappels', 'restitution_before_days');
  const beforeDays = parseNonNegativeInt(rawDays, 7);
  if (beforeDays === 0) {
    logger.log('Rappel de restitution désactivé par configuration (restitution_before_days = 0)');
    return 'skipped';
  }

  // Même garde que les rappels quotidiens : pas de requête ni de log
  // "failed" en boucle si le SMTP n'est pas configuré.
  const transporter = await getTransporter();
  if (!transporter) {
    logger.warn('Cron rappel restitution : SMTP non configuré, aucun rappel envoyé');
    return 'skipped';
  }

  const { start, end } = getRestitutionWindow(beforeDays);

  const eligibleBons = await prisma.bon.findMany({
    where: {
      // partially_returned inclus : équipements encore en possession du collaborateur
      // dont la date de restitution approche — le rappel reste pertinent même si
      // certains équipements ont déjà été restitués.
      status: { in: [...RESTITUTION_START_BON_STATUSES] },
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
      const ok = await sendReminder(bon as unknown as NotificationBon);
      if (ok) sentCount++;
      else failedCount++;
    } catch (err) {
      failedCount++;
      logger.error(`Erreur rappel restitution bon ${bon.id} (${bon.reference}): ${err}`);
    }
  }

  logger.log(
    `Cron rappel restitution terminé — ${eligibleBons.length} bon(s) éligible(s), ${sentCount} envoyé(s), ${failedCount} échoué(s)`,
  );
}
