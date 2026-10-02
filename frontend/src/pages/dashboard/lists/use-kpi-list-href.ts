import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { usePeriodParams } from '../use-period-params';
import { kpiListHref, type KpiListKey } from './kpi-lists';

/** Adresse de la liste d'un chiffre : la liste des bons filtrée sur la période
 *  et la filiale affichées, ou la liste dans le tableau de bord (onglet,
 *  période et filiale de l'adresse courante gardés). */
export function useKpiListHref(): (key: KpiListKey) => string {
  const [searchParams] = useSearchParams();
  const { from, to, filialeId } = usePeriodParams();
  return useCallback(
    (key: KpiListKey) => kpiListHref(key, searchParams, { from, to, filialeId }),
    [searchParams, from, to, filialeId],
  );
}
