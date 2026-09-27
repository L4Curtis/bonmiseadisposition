import { todayInParis } from '@/lib/dates';
import { NOT_RETURNED_SITUATION, type InventorySituation } from './types';

/** Ancienneté d'un prêt et retard de restitution — calculés en jours
 *  calendaires Europe/Paris (cf. todayInParis), jamais en heures, pour rester
 *  cohérents avec le résumé du parc (`/reporting/inventory/summary`) et
 *  l'export CSV (backend/src/reporting/inventory-dates.ts). */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Nombre de jours calendaires écoulés depuis `isoDate` (Europe/Paris) —
 *  ancienneté d'un prêt depuis sa date de mise à disposition. Négatif si la
 *  date est dans le futur. */
export function daysSince(isoDate: string): number {
  return Math.round((toUtcMs(todayInParis()) - toUtcMs(isoDate)) / MS_PER_DAY);
}

/** Nombre de jours de retard de restitution, ou `null` si la restitution
 *  n'est pas en retard (date absente, aujourd'hui ou dans le futur). */
export function daysOverdue(dateRestitution: string | null): number | null {
  if (!dateRestitution) return null;
  const days = daysSince(dateRestitution);
  return days > 0 ? days : null;
}

/** Retard d'un équipement de l'inventaire. Un équipement non restitué n'est
 *  plus attendu (déclaré perdu, cassé ou gardé) : jamais « en retard », même
 *  si la date de retour prévue de son bon est passée. */
export function equipmentOverdueDays(item: { situation: InventorySituation; dateRestitution: string | null }): number | null {
  return item.situation === NOT_RETURNED_SITUATION ? null : daysOverdue(item.dateRestitution);
}
