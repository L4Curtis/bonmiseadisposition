import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { NotificationService } from '../../notification/notification.service';
import { findItAlertRecipients } from '../../notification/it-alert-recipients';
import { resolveAppUrl } from '../../notification/app-url';
import { logFailedNotification, logNotificationResult } from '../../notification/notification-log';
import { CONTESTATION_OVERDUE_AFTER_DAYS, PENDING_CONTESTATION_STATUSES, overdueThreshold } from '../contestation-selects';
import {
  renderContestationOverdueAlert,
  OverdueContestationItem as OverdueContestation,
  TemplateRenderer,
} from '../../templates/contestation-overdue-alert';

export interface OverdueAlertDeps {
  prisma: PrismaService;
  configService: AppConfigService;
  notificationService: NotificationService;
  /** Rend le modèle personnalisable `contestation_overdue_alert` (TemplatesService). */
  templatesService: TemplateRenderer;
  logger: Logger;
}

/** Bilan d'un passage : contestations en retard, et combien ont été relancées. */
export interface OverdueAlertOutcome {
  overdue: number;
  alerted: number;
}

const ALERT_TYPE = 'contestation_overdue_alert' as const;

/** Marge retirée à la période de 7 jours ouvrés entre deux relances d'un même
 *  bon : le passage de 9 h démarre quelques secondes plus tôt ou plus tard
 *  que le précédent, et ne doit pas sauter son tour. */
const RE_ALERT_MARGIN_MS = 12 * 60 * 60 * 1000;

/** Contestations non tranchées depuis plus de 7 jours ouvrés, de la plus
 *  ancienne à la plus récente. */
async function findOverdue(prisma: PrismaService, now: Date): Promise<OverdueContestation[]> {
  const rows = await prisma.contestation.findMany({
    where: { status: { in: [...PENDING_CONTESTATION_STATUSES] }, createdAt: { lt: overdueThreshold(now) } },
    orderBy: { createdAt: 'asc' },
    select: {
      message: true,
      createdAt: true,
      bon: { select: { id: true, reference: true } },
      user: { select: { displayName: true } },
      reviewedBy: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    bonId: r.bon.id,
    bonReference: r.bon.reference,
    collaborateurName: r.user.displayName,
    message: r.message,
    createdAt: r.createdAt,
    reviewerName: r.reviewedBy?.displayName ?? null,
  }));
}

/** Une relance au plus par bon tous les 7 jours ouvrés : on écarte les bons
 *  déjà relancés avec succès depuis moins de 7 jours ouvrés (moins la marge).
 *  Deux passages le même jour n'envoient donc qu'une relance. */
async function withoutRecentAlert(
  prisma: PrismaService,
  items: readonly OverdueContestation[],
  now: Date,
): Promise<OverdueContestation[]> {
  const recent = await prisma.notificationLog.findMany({
    where: {
      bonId: { in: items.map((i) => i.bonId) },
      type: ALERT_TYPE,
      status: 'sent',
      sentAt: { gte: new Date(overdueThreshold(now).getTime() + RE_ALERT_MARGIN_MS) },
    },
    select: { bonId: true },
  });
  const alreadyAlerted = new Set(recent.map((r) => r.bonId));
  return items.filter((i) => !alreadyAlerted.has(i.bonId));
}

async function logFailure(prisma: PrismaService, items: readonly OverdueContestation[], errorMessage: string) {
  await Promise.all(
    items.map((i) => logFailedNotification(prisma, { bonId: i.bonId, recipientEmail: '', type: ALERT_TYPE, errorMessage })),
  );
}

/**
 * Relance l'équipe informatique (tous les administrateurs et techniciens
 * actifs) pour les contestations qui attendent une décision depuis plus de
 * 7 jours ouvrés (samedi et dimanche exclus, calendrier de Paris) : un seul
 * email récapitulatif, une ligne `NotificationLog` par bon (c'est elle qui
 * empêche de relancer le même bon avant 7 jours ouvrés ; un échec d'envoi
 * sera retenté au passage suivant).
 */
export async function runContestationOverdueAlerts(
  deps: OverdueAlertDeps,
  now: Date = new Date(),
): Promise<OverdueAlertOutcome> {
  const overdue = await findOverdue(deps.prisma, now);
  if (overdue.length === 0) return { overdue: 0, alerted: 0 };
  const due = await withoutRecentAlert(deps.prisma, overdue, now);
  if (due.length === 0) return { overdue: overdue.length, alerted: 0 };

  const recipients = await findItAlertRecipients(deps.prisma);
  if (recipients.length === 0) {
    await logFailure(deps.prisma, due, 'Aucun administrateur ni technicien actif avec une adresse email valide');
    return { overdue: overdue.length, alerted: 0 };
  }
  const appUrl = resolveAppUrl(await deps.configService.get('general', 'app_url'), process.env);
  if (!appUrl) {
    deps.logger.error("Relance des contestations non envoyée : URL de l'application non configurée");
    await logFailure(deps.prisma, due, "URL de l'application non configurée");
    return { overdue: overdue.length, alerted: 0 };
  }

  const { subject, html } = await renderContestationOverdueAlert(deps.templatesService, due, {
    appUrl,
    afterDays: CONTESTATION_OVERDUE_AFTER_DAYS,
    now,
  });
  const results = await Promise.all(recipients.map((to) => deps.notificationService.sendEmail(to, subject, html)));
  const anyOk = results.some((r) => r.ok);
  const error = results.filter((r) => !r.ok).map((r) => r.error ?? "Erreur d'envoi inconnue").join('; ');
  await Promise.all(
    due.map((i) =>
      logNotificationResult(deps.prisma, {
        bonId: i.bonId,
        recipientEmail: recipients.join(', '),
        type: ALERT_TYPE,
        result: anyOk ? { ok: true } : { ok: false, error },
      }),
    ),
  );
  return { overdue: overdue.length, alerted: anyOk ? due.length : 0 };
}
