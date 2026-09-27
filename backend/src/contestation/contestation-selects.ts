import type { ContestationStatus } from '@prisma/client';
import { CONTESTATION_TO_PROCESS_STATUSES } from '../common/bon-predicates';
import { businessDaysBefore } from './overdue/business-days';

/** Au-delà de ce délai, en jours ouvrés (samedi et dimanche exclus, décision
 *  du 26/09), une contestation non tranchée est « en retard » : la liste IT
 *  la signale et l'équipe informatique reçoit une relance par email. */
export const CONTESTATION_OVERDUE_AFTER_DAYS = 7;

/** Contestations pas encore tranchées : nouvelles ou prises en charge. Les
 *  mêmes que la tuile « Contestations à traiter » de l'accueil. */
export const PENDING_CONTESTATION_STATUSES: readonly ContestationStatus[] = CONTESTATION_TO_PROCESS_STATUSES;

const PERSON = { select: { id: true, displayName: true } } as const;

/** Auteur, « pris en charge par », « tranché par ». */
export const CONTESTATION_PEOPLE_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true } },
  reviewedBy: PERSON,
  resolvedBy: PERSON,
} as const;

/** Bon contesté avec son statut. */
export const CONTESTATION_BON_WITH_STATUS = { select: { id: true, reference: true, status: true } } as const;

/** Date avant laquelle une contestation non tranchée est en retard : 7 jours
 *  ouvrés avant `now`, à la même heure de Paris. */
export function overdueThreshold(now: Date): Date {
  return businessDaysBefore(now, CONTESTATION_OVERDUE_AFTER_DAYS);
}
