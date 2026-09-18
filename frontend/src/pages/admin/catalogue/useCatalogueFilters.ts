import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from './types';
import { filterAndSortCatalogItems } from './lib/search';
import type { CatalogueSortKey, SortDirection } from './lib/search';
import type { CatalogItem } from './types';

export const CATALOGUE_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** Recherche (anti-rebond), filtre par catégorie, tri par colonne et
 *  pagination pour la table du catalogue. Le volume d'équipements est faible :
 *  tout se fait côté client, à partir de la liste déjà chargée par
 *  {@link useCatalogue}. */
export function useCatalogueFilters(items: CatalogItem[]) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilterState] = useState('');
  const [sortKey, setSortKey] = useState<CatalogueSortKey>('category');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  // Anti-rebond de la recherche texte (300 ms), sans bloquer le filtre catégorie
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Retour à la page 1 dès qu'un filtre change (évite une page vide)
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

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
      search, category: categoryFilter, sortKey, sortDirection,
    }),
    [items, search, categoryFilter, sortKey, sortDirection],
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / CATALOGUE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * CATALOGUE_PAGE_SIZE, currentPage * CATALOGUE_PAGE_SIZE),
    [filteredItems, currentPage],
  );

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
    page: currentPage,
    setPage,
    totalPages,
    total: filteredItems.length,
    pageItems,
    filteredItems,
    hasActiveFilters,
    resetFilters,
  };
}
