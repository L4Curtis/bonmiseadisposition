import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContestationListItem, ContestationListResponse } from '@/contracts/contestations';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { useSearchParamsPatch } from '@/hooks/useSearchParamsPatch';
import { CONTESTATION_FILTERS, ContestationFilter, contestationFilterFromSearch } from './contestation-meta';

export const CONTESTATIONS_PAGE_SIZE = 25;

/** `?contestation=<id>` : ouvre la décision de cette contestation (bouton
 *  « Traiter la contestation » de la fiche d'un bon). */
export const CONTESTATION_PARAM = 'contestation';

/** Chargement, filtre (gardé dans l'adresse) et pagination de la liste IT des
 *  contestations, et la prise en charge (avec confirmation, sans faire
 *  disparaître la ligne : elle reste « À traiter »). */
export function useContestations() {
  const [data, setData] = useState<ContestationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { search, patch } = useSearchParamsPatch();
  const filter = contestationFilterFromSearch(search);
  const [deciding, setDeciding] = useState<ContestationListItem | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Seule la requête la plus récente compte (filtre ou page changés entre-temps).
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(CONTESTATIONS_PAGE_SIZE) });
    const query = CONTESTATION_FILTERS.find((f) => f.value === filter)?.query ?? {};
    for (const [key, value] of Object.entries(query)) params.set(key, value);
    api
      .get<ContestationListResponse>(`/contestations?${params}`)
      .then((res) => {
        if (requestIdRef.current === requestId) setData(res);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        // Une panne ne doit pas s'afficher comme « aucune contestation ».
        setData(null);
        setLoadError(errorMessage(e, 'Erreur lors du chargement des contestations'));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [filter, page]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  // Arrivée depuis la fiche d'un bon : la liste « À traiter » chargée, la
  // décision de la contestation demandée s'ouvre. Le paramètre disparaît de
  // l'adresse, pour qu'un rechargement ne rouvre pas la fenêtre.
  const requestedId = new URLSearchParams(search).get(CONTESTATION_PARAM);
  useEffect(() => {
    if (!requestedId || !data) return;
    const requested = data.contestations.find((c) => c.id === requestedId);
    if (requested) setDeciding(requested);
    patch({ [CONTESTATION_PARAM]: null });
  }, [requestedId, data, patch]);

  const setFilter = (value: ContestationFilter) => {
    const urlValue = CONTESTATION_FILTERS.find((f) => f.value === value)?.urlValue ?? null;
    // `aTraiter` (lien de la tuile) disparaît : `filtre` seul décrit la vue.
    patch({ filtre: urlValue, aTraiter: null });
    setPage(1);
  };

  const handleReview = async (contestation: ContestationListItem) => {
    setReviewingId(contestation.id);
    try {
      await api.patch(`/contestations/${contestation.id}/review`);
      toast({
        title: 'Contestation prise en charge',
        description: `${contestation.bon.reference} — ${contestation.user.displayName}. Tranchez-la dès que possible.`,
        variant: 'success',
      });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la prise en charge');
    } finally {
      setReviewingId(null);
    }
    load();
  };

  return {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    filter,
    setFilter,
    deciding,
    setDeciding,
    reviewingId,
    handleReview,
  };
}
