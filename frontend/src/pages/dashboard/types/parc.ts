import type { Compared, KpiEnvelope, SeriesPoint } from './common';

export interface ParcCategoryCount {
  category: string;
  label: string;
  count: number;
}

export interface ParcFilialeCount {
  filialeId: string;
  name: string;
  count: number;
}

export interface ParcTopModel {
  catalogItemId: string;
  label: string;
  category: string;
  count: number;
}

export interface ParcLoaned {
  total: number;
  bons: number;
  byCategory: ParcCategoryCount[];
  byFiliale: ParcFilialeCount[];
  topModels: ParcTopModel[];
  offCatalogShare: number | null;
  serialCoverage: number | null;
  /** Équipements chez les collaborateurs en fin de jour (semaine, mois) ; le
   *  point qui contient aujourd'hui égale `total`. */
  series: SeriesPoint[];
}

export interface ParcReturnOverdueTop {
  bonId: string;
  reference: string;
  filiale: string;
  collaborateur: string;
  dateRestitution: string;
  daysLate: number;
  equipments: number;
}

export interface ParcReturnOverdue {
  bons: number;
  equipments: number;
  avgDays: number | null;
  medianDays: number | null;
  top: ParcReturnOverdueTop[];
}

export interface ParcNotReturned {
  declared: Compared;
  found: Compared;
  closedBonsShare: Compared<number | null>;
  openNow: number;
}

/** GET /kpi/parc */
export interface ParcKpiResponse extends KpiEnvelope {
  loaned: ParcLoaned;
  returnOverdue: ParcReturnOverdue;
  notReturned: ParcNotReturned;
}
