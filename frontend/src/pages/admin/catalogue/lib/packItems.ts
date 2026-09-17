import type { Pack } from '../types';

export interface PackItemPayload {
  catalogItemId: string;
  quantity: number;
  order: number;
}

type PackItemEntry = Pack['items'][number];

/** Construit la liste d'items (payload PUT /equipment/packs/:id) apres ajout
 *  d'un nouvel equipement en fin de pack. */
export function buildAddItemPayload(
  items: PackItemEntry[],
  catalogItemId: string,
  quantity: number,
): PackItemPayload[] {
  return [
    ...items.map((i) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: i.order })),
    { catalogItemId, quantity, order: items.length },
  ];
}

/** Construit la liste d'items apres retrait d'un equipement, en renumerotant
 *  les positions (`order`) des items restants. */
export function buildRemoveItemPayload(items: PackItemEntry[], catalogItemId: string): PackItemPayload[] {
  return items
    .filter((i) => i.catalogItem.id !== catalogItemId)
    .map((i, idx) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: idx }));
}

/** Construit la liste d'items apres mise a jour de la quantite d'un equipement. */
export function buildUpdateQuantityPayload(
  items: PackItemEntry[],
  catalogItemId: string,
  quantity: number,
): PackItemPayload[] {
  return items.map((i) => ({
    catalogItemId: i.catalogItem.id,
    quantity: i.catalogItem.id === catalogItemId ? quantity : i.quantity,
    order: i.order,
  }));
}
