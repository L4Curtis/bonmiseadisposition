import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { ApiResourceState } from '@/hooks/use-api-resource';
import type { KpiListItem, KpiListMeta, KpiListResponse } from '@/contracts';

/**
 * Liste d'un chiffre (`GET /kpi/liste`), lue à la forme unique des listes
 * (`api.getList`) : une requête en vol est annulée quand la page, la période
 * ou la filiale changent, et sa réponse n'est jamais appliquée.
 */
export function useKpiList(path: string): ApiResourceState<KpiListResponse> {
  const [data, setData] = useState<KpiListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.getList<KpiListItem, KpiListMeta>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(errorMessage(e, 'Impossible de charger la liste'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, reload };
}
