import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ListResponse } from '@/contracts/common';
import { errorMessage } from '@/lib/errors';
import { useSearchParamsPatch } from '@/hooks/useSearchParamsPatch';
import { usePagination } from '@/hooks/usePagination';
import { AuditFilters, filterQuery, FILTER_KEYS, readFilters } from './auditFilters';
import type { AuditListMeta, AuditLogEntry } from './types';

export type AuditList = ListResponse<AuditLogEntry, AuditListMeta>;

/**
 * Journal d'audit : filtres et page lus dans l'adresse (et écrits dedans),
 * nombre de lignes (25, 50 ou 100) commun à toutes les listes et mémorisé
 * (`usePagination`), chargement de la liste (l'export, lui, passe par
 * AuditExportBar).
 */
export function useAuditLogs() {
  const { search, patch } = useSearchParamsPatch();
  const filters = useMemo(() => readFilters(search), [search]);
  const [data, setData] = useState<AuditList | null>(null);
  const pagination = usePagination({ total: data?.total });
  const { page, pageSize } = pagination;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Seule la réponse de la requête la plus récente compte (filtres changés vite).
  const requestIdRef = useRef(0);
  const query = filterQuery(filters).toString();

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams(query);
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    api.getList<AuditLogEntry, AuditListMeta>(`/audit?${params}`)
      .then((res) => { if (requestIdRef.current === requestId) setData(res); })
      .catch((e: unknown) => {
        if (requestIdRef.current === requestId) setLoadError(errorMessage(e, 'Erreur lors du chargement du journal'));
      })
      .finally(() => { if (requestIdRef.current === requestId) setLoading(false); });
  }, [query, page, pageSize]);

  useEffect(() => {
    load();
    return () => { requestIdRef.current += 1; };
  }, [load]);

  /** Change un ou plusieurs filtres et revient à la première page. */
  const setFilters = useCallback((changes: Partial<AuditFilters>) => {
    const patchValues = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value || null]));
    patch(patchValues, { page: null });
  }, [patch]);

  const resetFilters = useCallback(() => {
    patch({ ...Object.fromEntries(FILTER_KEYS.map((key) => [key, null])), page: null });
  }, [patch]);

  return {
    data, loading, loadError, load, filters, setFilters, resetFilters, pagination,
  };
}
