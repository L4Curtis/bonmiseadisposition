import { Prisma } from '@prisma/client';

/**
 * Dates « à l'heure de Paris » : l'unique implémentation du backend.
 *
 * Le conteneur de production tourne en UTC, le poste de développement à
 * l'heure de Paris. Aucun calcul ne doit donc dépendre du fuseau de la
 * machine : tout passe par ce fichier, qui nomme explicitement Europe/Paris.
 *
 * Deux représentations coexistent :
 * - un **instant** (`Date`) : colonnes `DateTime` comme `createdAt` ou
 *   `signedAt`. Prisma les stocke dans des `timestamp` SANS fuseau qui
 *   contiennent l'heure UTC ;
 * - une **date civile** `AAAA-MM-JJ` : filtres saisis à l'écran, et colonnes
 *   `@db.Date` comme `dateMiseDisposition`, que Prisma rend sous la forme
 *   « minuit UTC de ce jour-là » (voir `isoDateToUtc`).
 *
 * Le fichier fournit les fonctions JavaScript et leurs équivalents SQL
 * (fragments `Prisma.sql`), pour que l'application et la base découpent les
 * jours de la même façon.
 */

export const PARIS_TIME_ZONE = 'Europe/Paris';

/** Granularité d'un regroupement dans le temps (indicateurs). */
export type CalendarGranularity = 'day' | 'week' | 'month';

/** Période de dates civiles, bornes incluses. */
export interface IsoDateRange {
  from: string;
  to: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

// Les formateurs Intl coûtent cher à construire : on les crée une fois.
/** La locale en-CA est la seule dont le format court donne AAAA-MM-JJ. */
const parisIsoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const parisFrenchDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** La locale sv-SE donne « AAAA-MM-JJ HH:MM:SS ». */
const parisDateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const parisWallClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// ─── Dates civiles AAAA-MM-JJ ────────────────────────────────────────────────

/** Vrai si `value` a la forme AAAA-MM-JJ, sans vérifier que le jour existe. */
export function isIsoDateFormat(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

/** Vrai si `value` est une date AAAA-MM-JJ qui existe au calendrier.
 *  Refuse par exemple 2026-02-30, que `new Date()` accepterait en le
 *  reportant sans rien dire au 2 mars. */
export function isRealCalendarDate(value: string): boolean {
  if (!isIsoDateFormat(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const check = isoDateToUtc(value);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** Date civile → minuit UTC de ce jour, la forme sous laquelle Prisma lit et
 *  écrit une colonne `@db.Date`. */
export function isoDateToUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Minuit UTC (colonne `@db.Date`) → date civile AAAA-MM-JJ. */
export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ajoute (ou retire) des jours calendaires à une date civile. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  return utcToIsoDate(new Date(isoDateToUtc(isoDate).getTime() + days * MS_PER_DAY));
}

/** Nombre de jours calendaires de `from` à `to` (négatif si `to` précède). */
export function daysBetweenIsoDates(from: string, to: string): number {
  return Math.round((isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime()) / MS_PER_DAY);
}

// ─── Instants lus à l'heure de Paris ─────────────────────────────────────────

/** Jour civil (AAAA-MM-JJ) à Paris de l'instant donné. */
export function parisIsoDate(instant: Date): string {
  return parisIsoDateFormatter.format(instant);
}

/** « Aujourd'hui » à Paris (AAAA-MM-JJ). `now` est injectable pour les tests. */
export function todayInParis(now: Date = new Date()): string {
  return parisIsoDate(now);
}

/**
 * Date courte JJ/MM/AAAA à l'heure de Paris, pour les exports et les
 * documents. Convient aussi aux colonnes `@db.Date` : leur minuit UTC tombe
 * à 1 h ou 2 h du matin à Paris, donc le même jour.
 * Valeur absente ou illisible → `empty` (chaîne vide par défaut).
 */
export function formatParisDate(value: Date | string | null | undefined, empty = ''): string {
  if (value === null || value === undefined || value === '') return empty;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return empty;
  return parisFrenchDateFormatter.format(instant);
}

/** Horodatage lisible à l'heure de Paris : « 2026-09-24 14:05:09 ». */
export function formatParisDateTime(instant: Date): string {
  return parisDateTimeFormatter.format(instant);
}

/** Heure affichée par une horloge parisienne à cet instant, relue comme si
 *  c'était de l'UTC. La différence avec l'instant donne le décalage horaire. */
function parisWallClockMs(instant: Date): number {
  const parts = Object.fromEntries(
    parisWallClockFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
}

// ─── Bornes de jour et de mois (instants UTC) ───────────────────────────────

/** Instant de minuit, heure de Paris, du jour civil `isoDate`. */
export function parisDayStartUtc(isoDate: string): Date {
  const naive = isoDateToUtc(isoDate).getTime();
  // Décalage Paris/UTC (1 h ou 2 h selon l'heure d'été), puis seconde passe
  // pour le cas où minuit tombe de l'autre côté d'un changement d'heure.
  const firstGuess = naive - (parisWallClockMs(new Date(naive)) - naive);
  return new Date(naive - (parisWallClockMs(new Date(firstGuess)) - firstGuess));
}

/** Instant du 1er du mois en cours à Paris, 0 h. Borne basse d'un
 *  « ce mois-ci » : au soir du dernier jour du mois en UTC, Paris est déjà
 *  dans le mois suivant. */
export function parisMonthStartUtc(now: Date = new Date()): Date {
  return parisDayStartUtc(`${todayInParis(now).slice(0, 7)}-01`);
}

/** Jour civil de Paris, sous la forme d'une colonne `@db.Date` (minuit UTC
 *  de ce jour). Se compare directement à `dateMiseDisposition` ou
 *  `dateRestitution`. */
export function parisTodayAsDbDate(now: Date = new Date()): Date {
  return isoDateToUtc(todayInParis(now));
}

/** Jours calendaires écoulés depuis une colonne `@db.Date` jusqu'à
 *  aujourd'hui à Paris (négatif si la date est à venir). Sert à l'ancienneté
 *  d'un prêt et aux jours de retard. */
export function parisDaysSince(dbDate: Date, now: Date = new Date()): number {
  return Math.round((parisTodayAsDbDate(now).getTime() - dbDate.getTime()) / MS_PER_DAY);
}

// ─── Fragments SQL (Prisma.sql) ──────────────────────────────────────────────
//
// Rappel de la sémantique de Postgres :
//   - `timestamp AT TIME ZONE 'Europe/Paris'` lit des chiffres sans fuseau
//     comme une heure de Paris et renvoie un `timestamptz` ;
//   - `timestamptz AT TIME ZONE 'UTC'` renvoie les chiffres de l'heure UTC.
// Les bornes produites ici sont donc des `timestamp` sans fuseau en UTC,
// directement comparables aux colonnes de Prisma, quel que soit le réglage
// `TimeZone` de la session Postgres.
//
// Le nom du fuseau est écrit en clair, jamais passé en paramètre : une même
// expression répétée dans le SELECT et le GROUP BY recevrait deux paramètres
// distincts, et Postgres ne la reconnaîtrait plus comme identique.

const PARIS_ZONE_SQL = Prisma.raw(`'${PARIS_TIME_ZONE}'`);

/** Minuit à Paris du jour civil désigné par `dateExpr` (expression SQL de
 *  type `date`), en `timestamp` UTC sans fuseau. */
export function parisMidnightUtcSql(dateExpr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${dateExpr}::timestamp AT TIME ZONE ${PARIS_ZONE_SQL}) AT TIME ZONE 'UTC')`;
}

/** Borne basse (incluse) du jour civil `isoDate` à Paris. */
export function parisDayStartSql(isoDate: string): Prisma.Sql {
  return parisMidnightUtcSql(Prisma.sql`${isoDate}::date`);
}

/** Borne haute (exclue) du jour civil `isoDate` à Paris : minuit du lendemain. */
export function parisDayEndExclusiveSql(isoDate: string): Prisma.Sql {
  return parisMidnightUtcSql(Prisma.sql`(${isoDate}::date + 1)`);
}

/** `col >= début AND col < lendemain de la fin` : la colonne (instant UTC)
 *  tombe dans la période civile `[from, to]` à Paris. */
export function parisPeriodSql(col: Prisma.Sql, range: IsoDateRange): Prisma.Sql {
  return Prisma.sql`${col} >= ${parisDayStartSql(range.from)} AND ${col} < ${parisDayEndExclusiveSql(range.to)}`;
}

/** Début (jour, semaine au lundi, ou mois) du regroupement auquel appartient
 *  la colonne (instant UTC), découpé à l'heure de Paris. La colonne est
 *  d'abord explicitement lue en UTC : sans cela, ses chiffres seraient pris
 *  pour une heure de Paris (une à deux heures d'écart). */
export function parisBucketSql(col: Prisma.Sql, granularity: CalendarGranularity): Prisma.Sql {
  return Prisma.sql`date_trunc(${granularity}::text, (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${PARIS_ZONE_SQL})::date`;
}

/** Date du jour à Paris, en SQL (à comparer aux colonnes `@db.Date`). */
export function parisTodaySql(): Prisma.Sql {
  return Prisma.sql`(now() AT TIME ZONE ${PARIS_ZONE_SQL})::date`;
}
