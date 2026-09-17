import type { CatalogItem } from '../types';

const MAX_RESULTS = 15;

/** Filtre les equipements actifs du catalogue dont la marque, le modele, la
 *  description ou la categorie correspondent a la recherche, plafonne a
 *  {@link MAX_RESULTS} resultats (utilise par le champ de recherche du
 *  composant d'ajout d'equipement a un pack). */
export function filterActiveCatalogItems(
  items: CatalogItem[],
  query: string,
  categoryLabels: Record<string, string>,
): CatalogItem[] {
  const q = query.toLowerCase();
  return items.filter((item) => {
    if (!item.active) return false;
    return (
      item.brand.toLowerCase().includes(q) ||
      item.model.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      categoryLabels[item.category].toLowerCase().includes(q)
    );
  }).slice(0, MAX_RESULTS);
}
