import { BadRequestException } from '@nestjs/common';
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  isIsoDateFormat,
  isRealCalendarDate,
  isoDateToUtc,
  todayInParis,
  utcToIsoDate,
} from '../common/dates/paris';
import { Granularity, PreviousInfo } from './kpi-types';

/** Nombre de jours par défaut de la période (30 derniers jours, bornes incluses). */
const DEFAULT_RANGE_DAYS = 30;

/** Écart maximal autorisé entre `from` et `to`, en jours (hors bornes). */
const MAX_RANGE_SPAN_DAYS = 731;

/** Période résolue pour un appel `GET /kpi/*` : bornes courantes, granularité
 *  de bucket dérivée de la durée, et bornes de la période de comparaison. */
export interface KpiPeriod {
  from: string;
  to: string;
  days: number;
  granularity: Granularity;
  previous: PreviousInfo;
}

function invalidPeriod(message: string): never {
  throw new BadRequestException(`Période invalide : ${message}`);
}

function validateDateString(value: string, label: string): void {
  if (!isIsoDateFormat(value)) {
    invalidPeriod(`la date ${label} ("${value}") doit être au format AAAA-MM-JJ`);
  }
  if (!isRealCalendarDate(value)) {
    invalidPeriod(`la date ${label} ("${value}") n'existe pas`);
  }
}

/** Résout la période courante à partir de la query (`from`/`to` optionnels).
 *  Défaut : 30 derniers jours (bornes incluses) se terminant aujourd'hui
 *  (Europe/Paris). `today` est injectable pour les tests. */
export function resolvePeriod(
  query: { from?: string; to?: string },
  today: string = todayInParis(),
): KpiPeriod {
  const to = query.to ?? today;
  validateDateString(to, 'de fin');

  const from = query.from ?? addDaysToIsoDate(to, -(DEFAULT_RANGE_DAYS - 1));
  validateDateString(from, 'de début');

  const spanDays = daysBetweenIsoDates(from, to);
  if (spanDays < 0) {
    invalidPeriod('la date de début doit être antérieure ou égale à la date de fin');
  }

  if (spanDays > MAX_RANGE_SPAN_DAYS) {
    invalidPeriod(`l'écart entre les deux dates ne peut pas dépasser ${MAX_RANGE_SPAN_DAYS} jours`);
  }

  const days = spanDays + 1;
  const granularity = pickGranularity(days);

  return { from, to, days, granularity, previous: previousRange({ from, to }) };
}

/** Période précédente : même durée (en jours), se terminant la veille de `from`. */
export function previousRange(range: { from: string; to: string }): PreviousInfo {
  const length = daysBetweenIsoDates(range.from, range.to) + 1;
  const previousTo = addDaysToIsoDate(range.from, -1);
  const previousFrom = addDaysToIsoDate(previousTo, -(length - 1));
  return { from: previousFrom, to: previousTo };
}

/** Granularité des buckets de série : jour ≤ 31 j, semaine ≤ 182 j, sinon mois. */
export function pickGranularity(days: number): Granularity {
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}

/** Lundi de la semaine de `isoDate` (le jour même si c'est un lundi). */
function mondayOnOrBefore(isoDate: string): string {
  // getUTCDay() : dimanche = 0 … samedi = 6.
  const dayOfWeek = isoDateToUtc(isoDate).getUTCDay();
  return addDaysToIsoDate(isoDate, -((dayOfWeek + 6) % 7));
}

/** 1er du mois qui suit le mois de `isoDate`. */
function firstOfNextMonth(isoDate: string): string {
  const date = isoDateToUtc(isoDate);
  return utcToIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
}

/** Premier bucket et passage au suivant, selon la granularité. */
const BUCKET_STEPS: Record<Granularity, { first: (from: string) => string; next: (bucket: string) => string }> = {
  day: { first: (from) => from, next: (bucket) => addDaysToIsoDate(bucket, 1) },
  week: { first: mondayOnOrBefore, next: (bucket) => addDaysToIsoDate(bucket, 7) },
  month: { first: (from) => `${from.slice(0, 7)}-01`, next: firstOfNextMonth },
};

/** Construit la liste ordonnée des labels de bucket (YYYY-MM-DD, début de
 *  bucket) couvrant `[from, to]` inclus, selon la granularité. Semaine :
 *  buckets alignés sur le lundi. Mois : buckets alignés sur le 1er. */
export function buildBuckets(range: { from: string; to: string }, granularity: Granularity): string[] {
  const { first, next } = BUCKET_STEPS[granularity];
  const buckets: string[] = [];
  // Les dates AAAA-MM-JJ se comparent dans l'ordre alphabétique.
  for (let cursor = first(range.from); cursor <= range.to; cursor = next(cursor)) {
    buckets.push(cursor);
  }
  return buckets;
}

/** Complète une série partielle (résultat SQL groupé par bucket, buckets
 *  vides absents) pour couvrir tous les buckets attendus, à zéro sinon. */
export function fillSeries<T extends { bucket: string }>(
  buckets: readonly string[],
  rows: readonly T[],
  key: keyof T,
  zero: T[keyof T],
): T[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return buckets.map((bucket) => {
    const existing = byBucket.get(bucket);
    if (existing) return existing;
    return { bucket, [key]: zero } as unknown as T;
  });
}
