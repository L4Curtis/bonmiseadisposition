import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { downloadBlob } from '../filiales/lib/csv';
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
  const [exporting, setExporting] = useState(false);

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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = filterParams({ user, action, dateFrom, dateTo });
      const query = params.toString();
      const blob = await api.getBlob(`/audit/export${query ? `?${query}` : ''}`);
      downloadBlob(`journal-audit-${new Date().toISOString().slice(0, 10)}.csv`, blob);
      toast({
        title: 'Export réussi',
        description: data?.exportTruncated
          ? `Seules les ${data.exportLimit.toLocaleString('fr-FR')} entrées les plus récentes ont été exportées.`
          : 'Le fichier CSV a été téléchargé.',
        variant: data?.exportTruncated ? 'default' : 'success',
      });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export du journal");
    } finally {
      setExporting(false);
    }
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
