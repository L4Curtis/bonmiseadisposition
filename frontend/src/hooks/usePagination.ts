import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParamsPatch } from './useSearchParamsPatch';

/** Tailles de page proposées à l'utilisateur (décision du propriétaire). */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** Clé du choix mémorisé dans le navigateur, commune à toutes les listes :
 *  qui choisit 50 lignes les retrouve partout. */
export const PAGE_SIZE_STORAGE_KEY = 'bons-it:lignes-par-page';

export interface PaginationOptions {
  /** Nombre total d'éléments, quand il est connu : sert aux bornes affichées
   *  et ramène sur la dernière page si la page demandée n'existe plus. */
  readonly total?: number;
  /** Paramètre d'adresse de la page (défaut `page`). */
  readonly pageParam?: string;
  /** Clé de mémorisation propre à une liste, si elle doit avoir son propre choix. */
  readonly storageKey?: string;
}

export interface Pagination {
  /** Page courante, à partir de 1. */
  readonly page: number;
  readonly pageSize: PageSize;
  readonly setPage: (page: number) => void;
  /** Change la taille (mémorisée) et revient à la page 1. */
  readonly setPageSize: (size: PageSize) => void;
  /** Nombre d'éléments à sauter (`(page - 1) × taille`). */
  readonly offset: number;
  /** Au moins 1, même pour une liste vide. */
  readonly totalPages: number;
  /** Bornes affichées « 26–50 sur 132 » (0–0 pour une liste vide). */
  readonly rangeStart: number;
  readonly rangeEnd: number;
}

export function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly unknown[]).includes(value);
}

/**
 * Pagination d'une liste : la page vit dans l'adresse (lien partagé, retour
 * arrière), la taille (25, 50 ou 100) est le choix de l'utilisateur, mémorisé
 * dans son navigateur. Sans stockage disponible (navigation privée, stockage
 * bloqué), la taille choisie vaut pour la visite en cours.
 */
export function usePagination(options: PaginationOptions = {}): Pagination {
  const pageParam = options.pageParam ?? 'page';
  const storageKey = options.storageKey ?? PAGE_SIZE_STORAGE_KEY;
  const { search, patch } = useSearchParamsPatch();
  const [pageSize, setPageSizeState] = useState<PageSize>(() => readStoredPageSize(storageKey));

  const requestedPage = useMemo(() => parsePage(new URLSearchParams(search).get(pageParam)), [search, pageParam]);
  const totalPages = options.total === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.ceil(options.total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const setPage = useCallback((next: number) => {
    const safe = Math.max(1, Math.floor(next));
    patch({ [pageParam]: safe > 1 ? String(safe) : null });
  }, [patch, pageParam]);

  const setPageSize = useCallback((size: PageSize) => {
    if (!isPageSize(size)) return;
    setPageSizeState(size);
    writeStoredPageSize(storageKey, size);
    patch({ [pageParam]: null });
  }, [patch, pageParam, storageKey]);

  // Page disparue (éléments supprimés, filtre plus restrictif venu d'un lien) :
  // l'adresse suit la dernière page réellement affichée.
  useEffect(() => {
    if (options.total !== undefined && options.total > 0 && requestedPage > page) setPage(page);
  }, [options.total, requestedPage, page, setPage]);

  const total = options.total ?? 0;
  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    offset: (page - 1) * pageSize,
    totalPages: Number.isFinite(totalPages) ? totalPages : 1,
    rangeStart: total === 0 ? 0 : (page - 1) * pageSize + 1,
    rangeEnd: Math.min(page * pageSize, total),
  };
}

function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return page >= 1 ? page : 1;
}

function readStoredPageSize(key: string): PageSize {
  try {
    const stored = Number(localStorage.getItem(key));
    return isPageSize(stored) ? stored : DEFAULT_PAGE_SIZE;
  } catch {
    // Stockage inaccessible (navigation privée, cookies bloqués) : taille par défaut.
    return DEFAULT_PAGE_SIZE;
  }
}

function writeStoredPageSize(key: string, size: PageSize): void {
  try {
    localStorage.setItem(key, String(size));
  } catch {
    // Stockage inaccessible : le choix vaut pour la visite en cours seulement.
  }
}
