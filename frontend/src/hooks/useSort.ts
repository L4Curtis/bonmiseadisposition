import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParamsPatch } from './useSearchParamsPatch';

export type SortOrder = 'asc' | 'desc';
export type AriaSort = 'ascending' | 'descending' | 'none';

export interface SortOptions<F extends string> {
  /** Colonnes triables : même liste blanche que le serveur. */
  readonly fields: readonly F[];
  readonly defaultField: F;
  readonly defaultOrder?: SortOrder;
  /** Sens au premier clic sur une colonne ; par défaut croissant (A→Z).
   *  Les dates se trient plutôt du plus récent au plus ancien (`desc`). */
  readonly firstClickOrder?: Partial<Record<F, SortOrder>>;
  readonly sortParam?: string;
  readonly orderParam?: string;
  /** Paramètre de page remis à 1 à chaque changement de tri (défaut `page`). */
  readonly pageParam?: string;
}

export interface Sort<F extends string> {
  readonly field: F;
  readonly order: SortOrder;
  /** Clic sur un en-tête : même colonne → sens inversé ; autre colonne → son sens de premier clic. */
  readonly toggleSort: (field: F) => void;
  readonly setSort: (field: F, order: SortOrder) => void;
  /** Valeur de l'attribut `aria-sort` d'un en-tête de colonne. */
  readonly ariaSort: (field: F) => AriaSort;
}

/**
 * Tri d'une liste gardé dans l'adresse (`?sort=…&order=…`). Un champ inconnu
 * ou un sens invalide redonnent le tri par défaut ; le tri par défaut
 * n'apparaît pas dans l'adresse. Changer de tri ramène à la page 1.
 */
export function useSort<F extends string>(options: SortOptions<F>): Sort<F> {
  const sortParam = options.sortParam ?? 'sort';
  const orderParam = options.orderParam ?? 'order';
  const pageParam = options.pageParam ?? 'page';
  const defaultOrder = options.defaultOrder ?? 'asc';
  const { search, patch } = useSearchParamsPatch();

  // Les options sont souvent écrites en ligne par l'écran : lues via une
  // référence pour garder des fonctions stables d'un rendu à l'autre.
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const { field, order } = useMemo(() => {
    const params = new URLSearchParams(search);
    const rawField = params.get(sortParam);
    const rawOrder = params.get(orderParam);
    const knownField = rawField !== null && (options.fields as readonly string[]).includes(rawField);
    return {
      field: knownField ? (rawField as F) : options.defaultField,
      order: rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : defaultOrder,
    };
  }, [search, sortParam, orderParam, options.fields, options.defaultField, defaultOrder]);

  const setSort = useCallback((nextField: F, nextOrder: SortOrder) => {
    const isDefault = nextField === optionsRef.current.defaultField && nextOrder === defaultOrder;
    patch(
      { [sortParam]: isDefault ? null : nextField, [orderParam]: isDefault ? null : nextOrder },
      { [pageParam]: null },
    );
  }, [patch, sortParam, orderParam, pageParam, defaultOrder]);

  const toggleSort = useCallback((nextField: F) => {
    const nextOrder: SortOrder = nextField === field
      ? (order === 'asc' ? 'desc' : 'asc')
      : optionsRef.current.firstClickOrder?.[nextField] ?? 'asc';
    setSort(nextField, nextOrder);
  }, [field, order, setSort]);

  const ariaSort = useCallback((column: F): AriaSort => {
    if (column !== field) return 'none';
    return order === 'asc' ? 'ascending' : 'descending';
  }, [field, order]);

  return { field, order, toggleSort, setSort, ariaSort };
}
