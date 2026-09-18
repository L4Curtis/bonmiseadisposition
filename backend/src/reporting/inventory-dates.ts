import { todayInParis } from '../kpi/kpi-period';

/** Arithmétique de dates partagée par le filtre « en retard » et les colonnes
 *  d'ancienneté / retard de l'export CSV de l'inventaire. Toujours calculée en
 *  jours calendaires Europe/Paris (cf. todayInParis), jamais en heures, pour
 *  rester cohérente avec `/reporting/inventory/summary` (overdueRows) et le
 *  calcul équivalent côté frontend (pages/inventaire/dateMetrics.ts). */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minuit UTC du jour civil Europe/Paris de `now` — les colonnes `@db.Date`
 *  (dateMiseDisposition, dateRestitution) sont stockées par Prisma comme un
 *  minuit UTC représentant la date civile elle-même (aucune conversion de
 *  fuseau supplémentaire à leur appliquer), donc comparables directement à
 *  cette borne. */
export function parisMidnightUtc(now: Date = new Date()): Date {
  const [y, m, d] = todayInParis(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Nombre de jours calendaires écoulés entre `date` et aujourd'hui
 *  (Europe/Paris) : ancienneté d'un prêt depuis `dateMiseDisposition`, ou
 *  retard depuis `dateRestitution`. Négatif si `date` est dans le futur. */
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.round((parisMidnightUtc(now).getTime() - date.getTime()) / MS_PER_DAY);
}
