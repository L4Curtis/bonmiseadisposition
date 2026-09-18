import { matchesStatusFilter } from './statusFilter';
import type { ItemStatusFilter } from './statusFilter';
import type { CatalogItem } from '../types';

export const MAX_RESULTS = 15;

export type CatalogueSortKey = 'category' | 'brand' | 'model' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface CatalogueTableFilters {
  search: string;
  category: string;
  status: ItemStatusFilter;
  sortKey: CatalogueSortKey;
  sortDirection: SortDirection;
}

function matchesCatalogQuery(item: CatalogItem, query: string, categoryLabels: Record<string, string>): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  return (
    item.brand.toLowerCase().includes(q) ||
    item.model.toLowerCase().includes(q) ||
    (item.description || '').toLowerCase().includes(q) ||
    (categoryLabels[item.category] ?? '').toLowerCase().includes(q)
  );
}

/** Filtre les équipements actifs du catalogue dont la marque, le modèle, la
 *  description ou la catégorie correspondent à la recherche, plafonné à
 *  {@link MAX_RESULTS} résultats (utilisé par le champ de recherche du
 *  composant d'ajout d'équipement à un pack). */
export function filterActiveCatalogItems(
  items: CatalogItem[],
  query: string,
  categoryLabels: Record<string, string>,
): CatalogItem[] {
  return items
    .filter((item) => item.active && matchesCatalogQuery(item, query, categoryLabels))
    .slice(0, MAX_RESULTS);
}

/** Nombre total d'équipements actifs correspondant à la recherche, sans le
 *  plafond de {@link MAX_RESULTS} — permet d'afficher une mention quand la
 *  liste de résultats de {@link filterActiveCatalogItems} est tronquée. */
export function countActiveCatalogMatches(
  items: CatalogItem[],
  query: string,
  categoryLabels: Record<string, string>,
): number {
  return items.filter((item) => item.active && matchesCatalogQuery(item, query, categoryLabels)).length;
}

function sortValue(item: CatalogItem, key: CatalogueSortKey, categoryLabels: Record<string, string>): string {
  switch (key) {
    case 'category':
      return categoryLabels[item.category] ?? item.category;
    case 'brand':
      return item.brand;
    case 'model':
      return item.model;
    case 'status':
      return item.active ? '0-actif' : '1-desactive'; // clé de tri interne, jamais affichée
    default:
      return '';
  }
}

/** Filtre (recherche texte + catégorie) et trie les équipements du catalogue
 *  pour la table d'administration — contrairement à
 *  {@link filterActiveCatalogItems}, inclut les équipements désactivés (la
 *  table affiche les deux, avec un badge de statut). Volume faible : filtrage
 *  et tri entièrement côté client. */
export function filterAndSortCatalogItems(
  items: CatalogItem[],
  categoryLabels: Record<string, string>,
  filters: CatalogueTableFilters,
): CatalogItem[] {
  const q = filters.search.trim();
  const filtered = items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (!matchesStatusFilter(item.active, filters.status)) return false;
    return matchesCatalogQuery(item, q, categoryLabels);
  });

  const dir = filters.sortDirection === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const valueA = sortValue(a, filters.sortKey, categoryLabels);
    const valueB = sortValue(b, filters.sortKey, categoryLabels);
    return valueA.localeCompare(valueB) * dir;
  });
}
