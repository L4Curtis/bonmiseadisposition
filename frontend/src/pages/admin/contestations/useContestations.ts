import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import type { Contestation, ContestationResponse } from './types';

const LIMIT = 20;

/** Chargement + pagination + filtre de statut de la liste des contestations. */
export function useContestations() {
  const [data, setData] = useState<ContestationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilterState] = useState('open');
  const [resolving, setResolving] = useState<Contestation | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  // Identifie la requête la plus récente : ignore toute réponse arrivée après
  // qu'une requête plus récente ait déjà été lancée (filtres/pagination changés
  // entre-temps, ou rechargement manuel après une action).
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    api.get<ContestationResponse>(`/contestations?${params}`)
      .then((res) => {
        if (requestIdRef.current !== requestId) return;
        setData(res);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        // Une panne ne doit pas s'afficher comme « aucune contestation »
        setData(null);
        setLoadError(errorMessage(e, 'Erreur lors du chargement des contestations'));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [statusFilter, page]);

  useEffect(() => {
    load();
    // Invalide toute requête encore en vol au démontage (ou avant le prochain
    // appel de load) pour éviter un setState après démontage du composant.
    return () => { requestIdRef.current += 1; };
  }, [load]);

  const setStatusFilter = (value: string) => { setStatusFilterState(value); setPage(1); };

  const handleReview = async (id: string) => {
    try {
      await api.patch(`/contestations/${id}/review`);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la prise en charge');
    }
    load();
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const openCount = data?.openCount ?? data?.contestations.filter((c) => c.status === 'open').length ?? 0;

  return {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    resolving,
    setResolving,
    handleReview,
    totalPages,
    openCount,
  };
}
