const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Au-delà, les jours ne se lisent plus d'un coup d'œil : on passe aux mois. */
const DAYS_BEFORE_MONTHS = 60;
const DAYS_PER_MONTH = 30;

/** Durée écoulée depuis `iso`, en abrégé pour une colonne de tableau :
 *  « à l'instant », « il y a 25 min », « il y a 3 h », « il y a 12 j »,
 *  « il y a 4 mois ». Une date future (horloge du poste en retard) est
 *  traitée comme « à l'instant ». */
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  if (elapsed < MINUTE_MS) return 'à l’instant';
  if (elapsed < HOUR_MS) return `il y a ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `il y a ${Math.floor(elapsed / HOUR_MS)} h`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days < DAYS_BEFORE_MONTHS) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / DAYS_PER_MONTH)} mois`;
}

/** Nombre de jours pleins écoulés depuis `iso` (0 le jour même). */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}
