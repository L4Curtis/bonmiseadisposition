export const CATEGORIES: Record<string, string> = {
  pc_portable: 'PC Portable',
  pc_fixe: 'PC Fixe',
  ecran: 'Ecran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Telephone',
  housse: 'Housse',
  dock: 'Dock',
  cable: 'Cable',
  autre: 'Autre',
};

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

export type DeleteTarget =
  | { type: 'item'; id: string; label: string }
  | { type: 'pack'; id: string; label: string };

export type RemovePackItemTarget = { pack: Pack; catalogItemId: string; label: string };

export interface CatalogItemFormValues {
  category: string;
  brand: string;
  model: string;
  description: string;
}
