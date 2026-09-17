import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { AuditResponse } from './types';

const LIMIT = 50;

/** Chargement + filtres (email, action, plage de dates) + pagination du journal d'audit. */
export function useAuditLogs() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [userEmailInput, setUserEmailInput] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [action, setActionState] = useState('');
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  useEffect(() => {
    api.get<string[]>('/audit/actions').then(setAvailableActions).catch(() => {});
  }, []);

  // Identifie la requête la plus récente pour ignorer une réponse arrivée hors
  // ordre (filtres changés rapidement pendant qu'une requête précédente est en vol).
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (userEmail) params.set('userEmail', userEmail);
    if (action) params.set('action', action);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));

    api.get<AuditResponse>(`/audit?${params}`)
      .then((res) => {
        if (requestIdRef.current !== requestId) return;
        setData(res);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setLoadError(errorMessage(e, 'Erreur lors du chargement des logs'));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [userEmail, action, dateFrom, dateTo, page]);

  useEffect(() => {
    load();
    // Invalide toute requête encore en vol au démontage (ou avant le prochain
    // appel de load) pour éviter un setState après démontage du composant.
    return () => { requestIdRef.current += 1; };
  }, [load]);

  const setAction = (value: string) => { setActionState(value); setPage(1); };
  const setDateFrom = (value: string) => { setDateFromState(value); setPage(1); };
  const setDateTo = (value: string) => { setDateToState(value); setPage(1); };

  const applySearch = () => { setUserEmail(userEmailInput); setPage(1); };
  const resetFilters = () => {
    setUserEmailInput(''); setUserEmail('');
    setActionState(''); setDateFromState(''); setDateToState(''); setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    userEmailInput,
    setUserEmailInput,
    action,
    setAction,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    availableActions,
    applySearch,
    resetFilters,
    totalPages,
  };
}
