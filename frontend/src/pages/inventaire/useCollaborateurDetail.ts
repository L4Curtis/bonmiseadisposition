import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { buildBaseFilterEntries, type InventoryBaseFilters } from './inventoryFilterParams';
import type { InventoryItem, InventoryListResponse } from './types';

interface CollaborateurDetailState {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
}

const EMPTY_DETAIL: CollaborateurDetailState = { items: [], loading: false, error: null };
/** Un seul collaborateur dépasse rarement quelques dizaines d'équipements ;
 *  200 (plafond accepté par l'API) couvre largement le cas réel sans paginer
 *  le détail déplié. */
const DETAIL_LIMIT = 200;

/**
 * Dépliage des lignes de la vue « Par collaborateur » : plusieurs lignes
 * peuvent être dépliées simultanément (`expandedIds`, un Set). Le détail du
 * matériel d'un collaborateur n'est chargé qu'à son premier dépliage — en
 * réutilisant GET /reporting/inventory déjà filtré par collaborateurId (même
 * filtres actifs que le regroupement, cf. inventoryFilterParams.ts) — puis mis
 * en cache tant que les filtres actifs ne changent pas.
 */
export function useCollaborateurDetail(filters: InventoryBaseFilters) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailById, setDetailById] = useState<Record<string, CollaborateurDetailState>>({});

  // Un changement de filtre invalide le détail déjà chargé : les lignes
  // dépliées ne correspondraient plus au nouveau jeu filtré.
  useEffect(() => {
    setExpandedIds(new Set());
    setDetailById({});
  }, [filters.filialeFilter, filters.categoryFilter, filters.situationFilter, filters.search, filters.overdueFilter, filters.missingSerialFilter]);

  function loadDetail(collaborateurId: string) {
    setDetailById((prev) => ({ ...prev, [collaborateurId]: { items: [], loading: true, error: null } }));

    const params = new URLSearchParams(buildBaseFilterEntries(filters));
    params.set('collaborateurId', collaborateurId);
    params.set('limit', String(DETAIL_LIMIT));

    api
      .get<InventoryListResponse>(`/reporting/inventory?${params}`)
      .then((data) => {
        setDetailById((prev) => ({ ...prev, [collaborateurId]: { items: data.items, loading: false, error: null } }));
      })
      .catch((e: unknown) => {
        setDetailById((prev) => ({
          ...prev,
          [collaborateurId]: {
            items: [],
            loading: false,
            error: errorMessage(e, 'Erreur lors du chargement du détail'),
          },
        }));
      });
  }

  const toggle = (collaborateurId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(collaborateurId)) {
        next.delete(collaborateurId);
      } else {
        next.add(collaborateurId);
      }
      return next;
    });
    setDetailById((prev) => {
      if (prev[collaborateurId]) return prev;
      loadDetail(collaborateurId);
      return prev;
    });
  };

  return {
    expandedIds,
    toggle,
    detailFor: (collaborateurId: string): CollaborateurDetailState => detailById[collaborateurId] ?? EMPTY_DETAIL,
    retryDetail: loadDetail,
  };
}
