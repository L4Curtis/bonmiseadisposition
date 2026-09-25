import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { todayInParis } from '@/lib/dates';
import { CSV_EXPORT_SUCCESS, useDownload } from '@/hooks/useDownload';
import type { AuditResponse } from './types';

const LIMIT = 50;

interface AppliedFilters {
  user: string;
  action: string;
  dateFrom: string;
  dateTo: string;
}

/** Paramètres de filtre communs à la liste et à l'export CSV : l'export
 *  reprend exactement ce que l'écran affiche. */
function filterParams({ user, action, dateFrom, dateTo }: AppliedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (user) params.set('user', user);
  if (action) params.set('action', action);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  return params;
}

/** Chargement + filtres (auteur par nom ou email, action, période) +
 *  pagination + export CSV du journal d'audit. */
export function useAuditLogs() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [userInput, setUserInput] = useState('');
  const [user, setUser] = useState('');
  const [action, setActionState] = useState('');
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const { download, downloading: exporting } = useDownload();

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
    const params = filterParams({ user, action, dateFrom, dateTo });
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
  }, [user, action, dateFrom, dateTo, page]);

  useEffect(() => {
    load();
    // Invalide toute requête encore en vol au démontage (ou avant le prochain
    // appel de load) pour éviter un setState après démontage du composant.
    return () => { requestIdRef.current += 1; };
  }, [load]);

  const setAction = (value: string) => { setActionState(value); setPage(1); };
  const setDateFrom = (value: string) => { setDateFromState(value); setPage(1); };
  const setDateTo = (value: string) => { setDateToState(value); setPage(1); };

  const applySearch = () => { setUser(userInput.trim()); setPage(1); };
  const resetFilters = () => {
    setUserInput(''); setUser('');
    setActionState(''); setDateFromState(''); setDateToState(''); setPage(1);
  };

  // Export au-delà du plafond : le serveur coupe le fichier et le signale
  // (en-tête X-Truncated) ; useDownload prévient alors l'utilisateur.
  const exportCsv = async (): Promise<void> => {
    const query = filterParams({ user, action, dateFrom, dateTo }).toString();
    await download({
      path: `/audit/export${query ? `?${query}` : ''}`,
      fallbackFilename: `journal-audit-${todayInParis()}.csv`,
      errorMessage: "Erreur lors de l'export du journal",
      success: CSV_EXPORT_SUCCESS,
    });
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    userInput,
    setUserInput,
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
    exporting,
    exportCsv,
  };
}
