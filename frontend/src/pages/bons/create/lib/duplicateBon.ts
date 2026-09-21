import { newLine } from '../types';
import type { EquipmentLine } from '../types';

/** Équipement d'un bon source, tel que renvoyé par GET /bons (recherche) ou
 *  GET /bons/:id — sous-ensemble de BON_SELECT_SHAPE (backend) utile ici. */
export interface DuplicableBonEquipment {
  catalogItem?: { id: string; brand: string; model: string } | null;
  customLabel?: string | null;
}

/** Bon source pour « repartir d'un bon existant » — sous-ensemble de la
 *  réponse GET /bons/:id ou d'un élément de GET /bons?search=… */
export interface DuplicableBon {
  id: string;
  reference: string;
  dateMiseDisposition: string;
  collaborateur: { displayName: string };
  equipments: DuplicableBonEquipment[];
}

/** Reprend uniquement l'article de chaque ligne (catalogue ou libellé
 *  personnalisé) : ni numéro de série, ni numéro d'inventaire, ni notes —
 *  propres à un exemplaire précis, jamais à recopier d'un bon à l'autre
 *  (même règle que la duplication d'une ligne — voir duplicateLine). */
export function mapDuplicableEquipments(equipments: readonly DuplicableBonEquipment[]): EquipmentLine[] {
  return equipments.map((e) =>
    newLine({
      catalogItemId: e.catalogItem?.id,
      catalogItemLabel: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : undefined,
      customLabel: e.customLabel ?? undefined,
    }),
  );
}
