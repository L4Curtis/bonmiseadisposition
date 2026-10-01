import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ListResponse } from '@/contracts/common';
import { errorMessage } from '@/lib/errors';
import { useSearchParamsPatch } from '@/hooks/useSearchParamsPatch';
import { AuditFilters, filterQuery, FILTER_KEYS, readFilters, readPage } from './auditFilters';
import type { AuditListMeta, AuditLogEntry } from './types';

export const AUDIT_PAGE_SIZE = 50;

export type AuditList = ListResponse<AuditLogEntry, AuditListMeta>;

/**
 * Journal d'audit : filtres et page lus dans l'adresse (et écrits dedans),
 * chargement de la liste (l'export, lui, passe par AuditExportBar).
 */
export function useAuditLogs() {
  const { search, patch } = useSearchParamsPatch();
  const filters = useMemo(() => readFilters(search), [search]);
  const page = readPage(search);
  const [data, setData] = useState<AuditList | null>(null);
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
    params.set('limit', String(AUDIT_PAGE_SIZE));
    api.getList<AuditLogEntry, AuditListMeta>(`/audit?${params}`)
      .then((res) => { if (requestIdRef.current === requestId) setData(res); })
      .catch((e: unknown) => {
        if (requestIdRef.current === requestId) setLoadError(errorMessage(e, 'Erreur lors du chargement du journal'));
      })
      .finally(() => { if (requestIdRef.current === requestId) setLoading(false); });
  }, [query, page]);

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

  const setPage = useCallback((next: number) => {
    patch({ page: next > 1 ? String(next) : null });
  }, [patch]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / AUDIT_PAGE_SIZE)) : 0;

  return {
    data, loading, loadError, load, filters, setFilters, resetFilters,
    page, setPage, totalPages,
  };
}
