import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { kpiListHref, type KpiListKey } from './kpi-lists';

/** Adresse qui ouvre la liste d'un chiffre dans le tableau de bord, en
 *  gardant l'onglet, la période et la filiale de l'adresse courante. */
export function useKpiListHref(): (key: KpiListKey) => string {
  const [searchParams] = useSearchParams();
  return useCallback((key: KpiListKey) => kpiListHref(key, searchParams), [searchParams]);
}
