import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContestationListItem, ContestationListMeta, ContestationListResponse } from '@/contracts/contestations';
import { api, hasErrorCode } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { useSearchParamsPatch } from '@/hooks/useSearchParamsPatch';
import { usePagination } from '@/hooks/usePagination';
import { CONTESTATION_FILTERS, ContestationFilter, contestationFilterFromSearch } from './contestation-meta';

/** `?contestation=<id>` : ouvre la décision de cette contestation (bouton
 *  « Traiter la contestation » de la fiche d'un bon). */
export const CONTESTATION_PARAM = 'contestation';

/** Compteurs de l'en-tête quand le serveur ne les a pas envoyés. */
const NO_COUNTERS: ContestationListMeta = {
  openCount: 0,
  pendingCount: 0,
  overdueCount: 0,
  overdueAfterDays: 7,
  overdueSince: new Date(0).toISOString(),
};

/** Compteurs de l'en-tête d'une réponse de liste. */
export function contestationCounters(data: ContestationListResponse | null): ContestationListMeta {
  return data?.meta ?? NO_COUNTERS;
}

/** Chargement, filtre (gardé dans l'adresse) et pagination (25, 50 ou 100
 *  lignes, choix mémorisé) de la liste IT des contestations, et la prise en
 *  charge (avec confirmation, sans faire disparaître la ligne : elle reste
 *  « À traiter »). */
export function useContestations() {
  const [data, setData] = useState<ContestationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pagination = usePagination({ total: data?.total });
  const { page, pageSize, setPage } = pagination;
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
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    const query = CONTESTATION_FILTERS.find((f) => f.value === filter)?.query ?? {};
    for (const [key, value] of Object.entries(query)) params.set(key, value);
    api
      .getList<ContestationListItem, ContestationListMeta>(`/contestations?${params}`)
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
  }, [filter, page, pageSize]);

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
    const requested = data.items.find((c) => c.id === requestedId);
    if (requested) setDeciding(requested);
    patch({ [CONTESTATION_PARAM]: null });
  }, [requestedId, data, patch]);

  const setFilter = (value: ContestationFilter) => {
    const urlValue = CONTESTATION_FILTERS.find((f) => f.value === value)?.urlValue ?? null;
    // `aTraiter` (lien de la tuile) disparaît : `filtre` seul décrit la vue.
    patch({ filtre: urlValue, aTraiter: null, page: null });
  };

  const handleReview = async (contestation: ContestationListItem) => {
    setReviewingId(contestation.id);
    try {
      await api.post(`/contestations/${contestation.id}/review`);
      toast({
        title: 'Contestation prise en charge',
        description: `${contestation.bon.reference} — ${contestation.user.displayName}. Tranchez-la dès que possible.`,
        variant: 'success',
      });
    } catch (e: unknown) {
      if (hasErrorCode(e, 'contestation_already_handled')) {
        // Un collègue a été plus rapide : le message le nomme, la liste
        // rechargée le montre.
        const decided = e.details?.status === 'resolved' || e.details?.status === 'rejected';
        toast({ title: decided ? 'Contestation déjà tranchée' : 'Déjà prise en charge', description: e.message });
      } else {
        showActionError(e, 'Erreur lors de la prise en charge');
      }
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
    pagination,
    filter,
    setFilter,
    deciding,
    setDeciding,
    reviewingId,
    handleReview,
  };
}
