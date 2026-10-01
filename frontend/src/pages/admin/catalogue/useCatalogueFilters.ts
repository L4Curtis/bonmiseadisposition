import { useEffect, useMemo, useRef, useState } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { CATEGORIES } from './types';
import { filterAndSortCatalogItems } from './lib/search';
import type { CatalogueSortKey, SortDirection } from './lib/search';
import type { ItemStatusFilter } from './lib/statusFilter';
import type { CatalogItem } from './types';

const SEARCH_DEBOUNCE_MS = 300;

/** Recherche (anti-rebond), filtre par catégorie, filtre d'état (géré par
 *  l'appelant, partagé avec les packs — voir {@link ./lib/statusFilter}), tri
 *  par colonne et pagination pour la table du catalogue. Le volume
 *  d'équipements est faible : tout se fait côté client, à partir de la liste
 *  complète chargée par {@link useCatalogue}. La pagination est celle de
 *  toutes les listes (page dans l'adresse, 25, 50 ou 100 lignes). */
export function useCatalogueFilters(items: CatalogItem[], statusFilter: ItemStatusFilter) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilterState] = useState('');
  const [sortKey, setSortKey] = useState<CatalogueSortKey>('category');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Anti-rebond de la recherche texte (300 ms), sans bloquer le filtre catégorie
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const setCategoryFilter = (value: string): void => setCategoryFilterState(value);

  const toggleSort = (key: CatalogueSortKey): void => {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const filteredItems = useMemo(
    () => filterAndSortCatalogItems(items, CATEGORIES, {
      search, category: categoryFilter, status: statusFilter, sortKey, sortDirection,
    }),
    [items, search, categoryFilter, statusFilter, sortKey, sortDirection],
  );

  const pagination = usePagination({ total: filteredItems.length });
  const { offset, pageSize, setPage } = pagination;
  const pageItems = useMemo(() => filteredItems.slice(offset, offset + pageSize), [filteredItems, offset, pageSize]);

  // Retour à la page 1 quand un filtre change (évite une page vide) ; pas au
  // premier affichage, pour garder la page d'un lien partagé.
  const filtersKey = `${search}|${categoryFilter}|${statusFilter}`;
  const previousFilters = useRef(filtersKey);
  useEffect(() => {
    if (previousFilters.current === filtersKey) return;
    previousFilters.current = filtersKey;
    setPage(1);
  }, [filtersKey, setPage]);

  const hasActiveFilters = !!(search || categoryFilter);
  const resetFilters = (): void => {
    setSearchInput('');
    setSearch('');
    setCategoryFilterState('');
    setPage(1);
  };

  return {
    searchInput,
    setSearchInput,
    categoryFilter,
    setCategoryFilter,
    sortKey,
    sortDirection,
    toggleSort,
    pagination,
    total: filteredItems.length,
    pageItems,
    filteredItems,
    hasActiveFilters,
    resetFilters,
  };
}
