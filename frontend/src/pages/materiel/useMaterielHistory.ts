import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { usePagination, type Pagination } from '@/hooks/usePagination';
import type { ListResponse } from '@/contracts/common';
import type { EquipmentHistoryMeta } from '@/contracts/equipment';
import type { MaterielHistoryEntry } from './types';

/** Lignes qui disent où est l'équipement aujourd'hui : les plus récentes. */
const HEADER_PAGE = { page: 1, limit: 25 } as const;

function historyPath(reference: string, page: number, limit: number): string {
  return `/equipment/history?q=${encodeURIComponent(reference)}&page=${page}&limit=${limit}`;
}

export interface MaterielHistory {
  /** La page affichée de l'historique (null avant le premier chargement). */
  readonly history: ListResponse<MaterielHistoryEntry, EquipmentHistoryMeta> | null;
  /** Les bons les plus récents : l'état actuel de l'équipement s'en déduit,
   *  quelle que soit la page affichée. */
  readonly latestEntries: readonly MaterielHistoryEntry[];
  readonly error: string | null;
  readonly loading: boolean;
  readonly pagination: Pagination;
}

/**
 * Historique d'un matériel (GET /equipment/history?q=&page=&limit=), page par
 * page. L'export CSV est le bouton commun (`MaterielHistoryHeader`). `reference` est déjà décodée — voir
 * `decodeReferenceParam` dans types.ts pour le décodage depuis l'URL.
 */
export function useMaterielHistory(reference: string): MaterielHistory {
  const [loaded, setLoaded] = useState<{
    reference: string;
    list: ListResponse<MaterielHistoryEntry, EquipmentHistoryMeta>;
  } | null>(null);
  const [latest, setLatest] = useState<{ reference: string; entries: MaterielHistoryEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Une page chargée pour une autre référence n'est jamais montrée.
  const history = loaded?.reference === reference ? loaded.list : null;
  const pagination = usePagination({ total: history?.total });
  const { page, pageSize } = pagination;

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .getList<MaterielHistoryEntry, EquipmentHistoryMeta>(historyPath(reference, page, pageSize))
      .then((data) => {
        if (ignore) return;
        setLoaded({ reference, list: data });
        if (page === 1) setLatest({ reference, entries: data.items });
      })
      .catch((e: unknown) => {
        if (!ignore) setError(errorMessage(e, 'Erreur de chargement'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reference, page, pageSize]);

  // Arrivée directe sur une page suivante (lien partagé, retour arrière) :
  // l'état actuel se lit tout de même sur les bons les plus récents.
  const needsLatest = page > 1 && latest?.reference !== reference;
  useEffect(() => {
    if (!needsLatest) return;
    let ignore = false;
    api
      .getList<MaterielHistoryEntry>(historyPath(reference, HEADER_PAGE.page, HEADER_PAGE.limit))
      .then((data) => {
        if (!ignore) setLatest({ reference, entries: data.items });
      })
      .catch(() => {
        // L'en-tête retombe sur la page affichée : la liste reste lisible.
      });
    return () => {
      ignore = true;
    };
  }, [needsLatest, reference]);

  const latestEntries = latest?.reference === reference ? latest.entries : (history?.items ?? []);
  return { history, latestEntries, error, loading, pagination };
}
