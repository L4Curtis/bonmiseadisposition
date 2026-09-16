import { BadRequestException } from '@nestjs/common';
import { Granularity, PreviousInfo } from './kpi-types';

/** Fuseau de référence pour toute date civile manipulée côté KPI. */
const PARIS_TZ = 'Europe/Paris';

/** Nombre de jours par défaut de la période (30 derniers jours, bornes incluses). */
const DEFAULT_RANGE_DAYS = 30;

/** Écart maximal autorisé entre `from` et `to`, en jours (hors bornes). */
const MAX_RANGE_SPAN_DAYS = 731;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parisDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Période résolue pour un appel `GET /kpi/*` : bornes courantes, granularité
 *  de bucket dérivée de la durée, et bornes de la période de comparaison. */
export interface KpiPeriod {
  from: string;
  to: string;
  days: number;
  granularity: Granularity;
  previous: PreviousInfo;
}

/** « Aujourd'hui » en date civile Europe/Paris (YYYY-MM-DD), indépendant du
 *  fuseau de la machine qui exécute le code. */
export function todayInParis(now: Date = new Date()): string {
  return parisDateFormatter.format(now);
}

function parseIsoDateParts(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { y, m, d };
}

/** Valide qu'une chaîne AAAA-MM-JJ correspond à une date calendaire réelle
 *  (rejette par exemple 2026-02-30, que `new Date()` accepterait en la
 *  reportant silencieusement au 2 mars). */
function isRealCalendarDate(value: string): boolean {
  const { y, m, d } = parseIsoDateParts(value);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

function parseUtcDate(value: string): Date {
  const { y, m, d } = parseIsoDateParts(value);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * 86_400_000);
}

/** Écart en jours calendaires entre deux dates (b − a), sans tenir compte des heures. */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function invalidPeriod(message: string): never {
  throw new BadRequestException(`Période invalide : ${message}`);
}

function validateDateString(value: string, label: string): void {
  if (!ISO_DATE_RE.test(value)) {
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

  const from = query.from ?? formatUtcDate(addUtcDays(parseUtcDate(to), -(DEFAULT_RANGE_DAYS - 1)));
  validateDateString(from, 'de début');

  const fromDate = parseUtcDate(from);
  const toDate = parseUtcDate(to);

  if (fromDate.getTime() > toDate.getTime()) {
    invalidPeriod('la date de début doit être antérieure ou égale à la date de fin');
  }

  const spanDays = diffDays(fromDate, toDate);
  if (spanDays > MAX_RANGE_SPAN_DAYS) {
    invalidPeriod(`l'écart entre les deux dates ne peut pas dépasser ${MAX_RANGE_SPAN_DAYS} jours`);
  }

  const days = spanDays + 1;
  const granularity = pickGranularity(days);

  return { from, to, days, granularity, previous: previousRange({ from, to }) };
}

/** Période précédente : même durée (en jours), se terminant la veille de `from`. */
export function previousRange(range: { from: string; to: string }): PreviousInfo {
  const fromDate = parseUtcDate(range.from);
  const toDate = parseUtcDate(range.to);
  const length = diffDays(fromDate, toDate) + 1;

  const previousTo = addUtcDays(fromDate, -1);
  const previousFrom = addUtcDays(previousTo, -(length - 1));

  return { from: formatUtcDate(previousFrom), to: formatUtcDate(previousTo) };
}

/** Granularité des buckets de série : jour ≤ 31 j, semaine ≤ 182 j, sinon mois. */
export function pickGranularity(days: number): Granularity {
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}

function mondayOnOrBefore(date: Date): Date {
  // getUTCDay() : dimanche = 0 … samedi = 6. Décalage vers le lundi précédent (ou le jour même).
  const dayOfWeek = date.getUTCDay();
  const offsetFromMonday = (dayOfWeek + 6) % 7;
  return addUtcDays(date, -offsetFromMonday);
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

/** Construit la liste ordonnée des labels de bucket (YYYY-MM-DD, début de
 *  bucket) couvrant `[from, to]` inclus, selon la granularité. Semaine :
 *  buckets alignés sur le lundi. Mois : buckets alignés sur le 1er. */
export function buildBuckets(range: { from: string; to: string }, granularity: Granularity): string[] {
  const toDate = parseUtcDate(range.to);
  const buckets: string[] = [];

  if (granularity === 'day') {
    let cursor = parseUtcDate(range.from);
    while (cursor.getTime() <= toDate.getTime()) {
      buckets.push(formatUtcDate(cursor));
      cursor = addUtcDays(cursor, 1);
    }
    return buckets;
  }

  if (granularity === 'week') {
    let cursor = mondayOnOrBefore(parseUtcDate(range.from));
    while (cursor.getTime() <= toDate.getTime()) {
      buckets.push(formatUtcDate(cursor));
      cursor = addUtcDays(cursor, 7);
    }
    return buckets;
  }

  let cursor = firstOfMonth(parseUtcDate(range.from));
  while (cursor.getTime() <= toDate.getTime()) {
    buckets.push(formatUtcDate(cursor));
    cursor = addUtcMonths(cursor, 1);
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
