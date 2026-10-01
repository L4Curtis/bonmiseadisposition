import type { ExportFilter } from '@/components/export';
import { LATENESS_LABELS } from '@/domain/labels';
import type { InventoryBaseFilters } from './inventoryFilterParams';
import { NOT_RETURNED_SITUATION, type InventoryCategorySummary, type InventorySituationSummary } from './types';

/** Référentiels qui donnent leur nom aux filtres (options des listes déroulantes). */
export interface InventoryFilterNames {
  readonly filiales: readonly { id: string; displayName: string }[];
  readonly categories: readonly InventoryCategorySummary[];
  readonly situations: readonly InventorySituationSummary[];
}

function situationName(value: string, situations: readonly InventorySituationSummary[]): string {
  if (value === NOT_RETURNED_SITUATION) return 'Non restitué';
  return situations.find((s) => s.situation === value)?.label ?? value;
}

/**
 * Filtres actifs de l'inventaire, en mots d'écran, pour l'annonce faite avant
 * l'export (« Filiale : Paris ; Situation : En cours ; Retour en retard :
 * oui »). Les mêmes que l'export transmet au serveur ; le filtre de compte,
 * propre à la vue par collaborateur, n'en fait pas partie.
 */
export function inventoryExportFilters(f: InventoryBaseFilters, names: InventoryFilterNames): ExportFilter[] {
  const filters: ExportFilter[] = [];
  if (f.filialeFilter) {
    filters.push({ label: 'Filiale', value: names.filiales.find((x) => x.id === f.filialeFilter)?.displayName ?? 'filiale choisie' });
  }
  if (f.categoryFilter) {
    filters.push({ label: 'Catégorie', value: names.categories.find((c) => c.category === f.categoryFilter)?.label ?? f.categoryFilter });
  }
  if (f.situationFilter) filters.push({ label: 'Situation', value: situationName(f.situationFilter, names.situations) });
  if (f.search) filters.push({ label: 'Recherche', value: `« ${f.search} »` });
  if (f.overdueFilter) filters.push({ label: LATENESS_LABELS.return, value: 'oui' });
  if (f.missingSerialFilter) filters.push({ label: 'Sans numéro de série', value: 'oui' });
  if (f.offCatalogFilter) filters.push({ label: 'Hors catalogue', value: 'oui' });
  return filters;
}
