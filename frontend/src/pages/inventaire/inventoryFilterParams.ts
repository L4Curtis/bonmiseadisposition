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
}

/** Couple [clé, valeur] des filtres de base actifs, dans l'ordre stable utilisé
 *  par toutes les requêtes de l'inventaire (filiale, catégorie, situation,
 *  recherche, retard, sans numéro de série). N'inclut ni le tri ni la pagination : à ajouter par
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
  return entries;
}

/** Taille de page commune aux deux vues (backend : DEFAULT_PAGE_LIMIT). */
export const PAGE_LIMIT = 50;

export interface PaginationInfo {
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
}

/** Informations d'affichage de la pagination (« Page X sur Y »,
 *  « Affichage A–B sur N ») — partagées par les deux vues, qui utilisent la
 *  même taille de page mais un total différent (équipements ou
 *  collaborateurs). */
export function computePaginationInfo(total: number, page: number, limit: number = PAGE_LIMIT): PaginationInfo {
  return {
    totalPages: Math.ceil(total / limit),
    rangeStart: total === 0 ? 0 : (page - 1) * limit + 1,
    rangeEnd: Math.min(page * limit, total),
  };
}
