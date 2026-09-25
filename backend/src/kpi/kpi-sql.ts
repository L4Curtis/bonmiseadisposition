import { Prisma } from '@prisma/client';
import { Compared, Granularity } from './kpi-types';

/**
 * Fragments SQL propres aux indicateurs (filtre filiale, pas de
 * `generate_series`) et conversions bigint/Decimal → number. Les bornes de
 * période et les regroupements à l'heure de Paris viennent de
 * `common/dates/paris.ts`.
 *
 * Règle non négociable (cf. kpi-design.md) : toute requête utilise ces
 * fragments via `Prisma.sql` — jamais de concaténation de chaîne côté SQL.
 */

/** Filtre filiale optionnel sur l'alias de table donné (ex. `filialeFilter('b', id)`
 *  → `AND b.filiale_id = $1`). `Prisma.empty` si `filialeId` est absent. */
export function filialeFilter(alias: string, filialeId?: string): Prisma.Sql {
  if (!filialeId) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(alias)}.filiale_id = ${filialeId}`;
}

const STEP_INTERVAL: Record<Granularity, string> = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
};

/** Pas d'incrémentation (pour `generate_series`) correspondant à la granularité. */
export function stepInterval(granularity: Granularity): Prisma.Sql {
  return Prisma.sql`${STEP_INTERVAL[granularity]}::interval`;
}

/** Convertit un résultat de requête brute (bigint, Decimal, string numérique)
 *  en `number` JS sûr. `null`/`undefined` → 0. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

/** Ratio `num / den`, `null` si le dénominateur est nul (évite une division
 *  par zéro et signale « pas de données » plutôt que 0). */
export function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/** Enveloppe une paire courant/précédent dans la forme `Compared` commune. */
export function compared(current: number, previous: number): Compared {
  return { current, previous };
}

/** Formate une valeur de bucket (Date Postgres ou déjà une chaîne) en label
 *  YYYY-MM-DD, en UTC (les bornes de bucket sont déjà calculées en fuseau
 *  Paris côté SQL ; ceci n'est qu'une extraction Y-M-D, pas une conversion). */
export function bucketLabel(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
