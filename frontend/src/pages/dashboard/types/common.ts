import type { Granularity } from '@/components/dashboard/charts/TimeSeriesChart';

export type { Granularity };

export interface PeriodInfo {
  from: string;
  to: string;
  granularity: Granularity;
  days: number;
}

export interface PreviousRange {
  from: string;
  to: string;
}

/** Paire valeur courante / valeur période précédente — utilisée par tous les
 *  flux comparés des endpoints /kpi/*. */
export interface Compared<T = number> {
  current: T;
  previous: T | null;
}

export interface SeriesPoint {
  bucket: string;
  [key: string]: number | string;
}

/** Champs communs à toutes les enveloppes /kpi/*. */
export interface KpiEnvelope {
  period: PeriodInfo;
  previous: PreviousRange;
  filialeId: string | null;
}
