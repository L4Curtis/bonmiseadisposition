import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { buildBaseFilterEntries, PAGE_LIMIT, type InventoryBaseFilters } from './inventoryFilterParams';
import type { CollaborateurInventoryItem, CollaborateurInventoryResponse, CollaborateurSort } from './types';

interface UseCollaborateurInventoryOptions {
  /** La requête n'est déclenchée que si la vue « Par collaborateur » est
   *  active — évite d'interroger les deux vues en parallèle. */
  enabled: boolean;
  filters: InventoryBaseFilters;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
}

/**
 * Chargement de la vue « Par collaborateur » de l'inventaire
 * (GET /reporting/inventory/by-collaborateur) — mêmes filtres que la vue par
 * équipement (buildBaseFilterEntries, cf. inventoryFilterParams.ts), avec un
 * tri propre à cette vue (count/oldest, cf. dto backend).
 */
export function useCollaborateurInventory({ enabled, filters, page, setPage }: UseCollaborateurInventoryOptions) {
  const [items, setItems] = useState<CollaborateurInventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSortState] = useState<CollaborateurSort>('count');
  const [reloadKey, setReloadKey] = useState(0);

  const setSort = (value: CollaborateurSort) => {
    setSortState(value);
    setPage(1);
  };
  const retry = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    // Même garde-fou que useInventory : ignore une réponse arrivée après
    // qu'un nouveau filtre/tri a relancé la requête.
    let ignore = false;

    const params = new URLSearchParams(buildBaseFilterEntries(filters));
    if (sort !== 'count') params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));

    api
      .get<CollaborateurInventoryResponse>(`/reporting/inventory/by-collaborateur?${params}`)
      .then((data) => {
        if (ignore) return;
        setItems(data.items);
        setTotal(data.total);
        setTruncated(data.truncated === true);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setItems([]);
        setTotal(0);
        setTruncated(false);
        setError(errorMessage(e, 'Erreur lors du chargement des collaborateurs'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    filters.filialeFilter,
    filters.categoryFilter,
    filters.situationFilter,
    filters.search,
    filters.overdueFilter,
    sort,
    page,
    reloadKey,
  ]);

  return { items, total, truncated, loading, error, retry, sort, setSort, limit: PAGE_LIMIT };
}
