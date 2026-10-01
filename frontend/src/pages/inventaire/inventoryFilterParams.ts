import { DEFAULT_PAGE_SIZE, PAGE_SIZE_STORAGE_KEY, isPageSize, type PageSize } from '@/hooks/usePagination';

/** Filtres partagés par les deux vues de l'inventaire (par équipement et par
 *  collaborateur), ainsi que par l'export CSV et le détail chargé au dépliage
 *  d'une ligne collaborateur. Isolé de useInventory.ts pour être réutilisé sans
 *  duplication par useCollaborateurInventory.ts et useCollaborateurDetail.ts —
 *  même exigence de non-duplication que côté backend (InventoryService.buildWhere). */
export interface InventoryBaseFilters {
  filialeFilter: string;
  categoryFilter: string;
  situationFilter: string;
  search: string;
  overdueFilter: boolean;
  /** Qualité des données : matériel sans numéro de série (`sansNumeroSerie=1`). */
  missingSerialFilter: boolean;
  /** Qualité des données : matériel hors Catalogue (`horsCatalogue=1`). */
  offCatalogFilter: boolean;
}

/** Couple [clé, valeur] des filtres de base actifs, dans l'ordre stable utilisé
 *  par toutes les requêtes de l'inventaire (filiale, catégorie, situation,
 *  recherche, retard, sans numéro de série, hors catalogue). N'inclut ni le tri ni la pagination : à ajouter par
 *  l'appelant selon la vue (liste par équipement, regroupement par
 *  collaborateur, ou détail d'un collaborateur). */
export function buildBaseFilterEntries(f: InventoryBaseFilters): [string, string][] {
  const entries: [string, string][] = [];
  if (f.filialeFilter) entries.push(['filialeId', f.filialeFilter]);
  if (f.categoryFilter) entries.push(['category', f.categoryFilter]);
  if (f.situationFilter) entries.push(['situation', f.situationFilter]);
  if (f.search) entries.push(['search', f.search]);
  if (f.overdueFilter) entries.push(['overdue', '1']);
  if (f.missingSerialFilter) entries.push(['sansNumeroSerie', '1']);
  if (f.offCatalogFilter) entries.push(['horsCatalogue', '1']);
  return entries;
}

/** Taille de page choisie par l'utilisateur, commune à toutes les listes
 *  (même clé de mémorisation que `usePagination`) : 25, 50 ou 100. */
export function readStoredPageSize(): PageSize {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return isPageSize(stored) ? stored : DEFAULT_PAGE_SIZE;
  } catch {
    // Stockage inaccessible (navigation privée, cookies bloqués) : taille par défaut.
    return DEFAULT_PAGE_SIZE;
  }
}

/** Mémorise le choix dans le navigateur ; sans stockage, il vaut pour la visite. */
export function storePageSize(size: PageSize): void {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    // Stockage inaccessible : le choix vaut pour la visite en cours seulement.
  }
}
