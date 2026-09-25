import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { detectPreset, presetRange, type DateRange, type Preset } from '@/lib/kpi-period';
import { todayInParis } from '@/lib/dates';

const DEFAULT_PRESET: Preset = '30d';

export interface PeriodParams {
  tab: string | null;
  from: string;
  to: string;
  filialeId: string | null;
  /** Preset détecté depuis `from`/`to` ; `null` = période personnalisée. */
  preset: Preset | null;
  setTab: (tab: string) => void;
  setRange: (range: DateRange) => void;
  setPreset: (preset: Preset) => void;
  setFilialeId: (filialeId: string | null) => void;
}

/** Lit/écrit `?tab&from&to&filialeId` dans l'URL — état partagé de
 *  DashboardPage et de ses onglets. Toutes les mises à jour sont immuables
 *  (nouvel objet `URLSearchParams`) et remplacent l'entrée d'historique
 *  courante (`replace: true`), pour ne pas polluer le bouton retour. */
export function usePeriodParams(): PeriodParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayInParis();

  const tab = searchParams.get('tab');
  const filialeId = searchParams.get('filialeId');

  const defaultRange = useMemo(() => presetRange(DEFAULT_PRESET, today), [today]);
  const from = searchParams.get('from') ?? defaultRange.from;
  const to = searchParams.get('to') ?? defaultRange.to;
  const preset = useMemo(() => detectPreset({ from, to }, today), [from, to, today]);

  const setTab = useCallback((nextTab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setRange = useCallback((range: DateRange) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('from', range.from);
      next.set('to', range.to);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setPreset = useCallback((nextPreset: Preset) => {
    setRange(presetRange(nextPreset, today));
  }, [setRange, today]);

  const setFilialeId = useCallback((nextFilialeId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextFilialeId) next.set('filialeId', nextFilialeId);
      else next.delete('filialeId');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return { tab, from, to, filialeId, preset, setTab, setRange, setPreset, setFilialeId };
}
