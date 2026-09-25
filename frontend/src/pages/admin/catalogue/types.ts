/** Catégories d'articles : lexique commun (`@/domain/labels`). */
export { CATEGORY_LABELS as CATEGORIES } from '@/domain/labels';

export interface CatalogItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  description?: string;
  active: boolean;
}

export interface Pack {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  items: { id: string; catalogItem: CatalogItem; quantity: number; order: number }[];
}

/** Cible de la boîte de confirmation de désactivation (équipement ou pack). */
export type DeactivateTarget =
  | { type: 'item'; id: string; label: string }
  | { type: 'pack'; id: string; label: string };

export type RemovePackItemTarget = { pack: Pack; catalogItemId: string; label: string };

export interface CatalogItemFormValues {
  category: string;
  brand: string;
  model: string;
  description: string;
}

/** Réponse de POST /equipment/catalog/import. */
export interface CatalogImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
}
