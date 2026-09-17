import type { EquipmentLine } from '../types';

export interface BuildBonPayloadOptions {
  filialeId: string;
  collaborateurId: string;
  civilite: 'mme' | 'mr';
  dateMiseDisposition: string;
  dateRestitution: string;
  notes: string;
  validEquipments: EquipmentLine[];
  isEditing: boolean;
}

/** Construit le payload envoyé à POST/PUT /bons. En édition, une valeur vide
 *  doit EFFACER le champ côté backend (null) ; en création, un champ vide ne
 *  doit simplement pas être envoyé. */
export function buildBonPayload({
  filialeId,
  collaborateurId,
  civilite,
  dateMiseDisposition,
  dateRestitution,
  notes,
  validEquipments,
  isEditing,
}: BuildBonPayloadOptions) {
  return {
    filialeId,
    collaborateurId,
    civilite,
    dateMiseDisposition,
    dateRestitution: isEditing ? (dateRestitution || null) : (dateRestitution || undefined),
    notes: isEditing ? notes : (notes || undefined),
    equipments: validEquipments.map((e, idx) => ({
      catalogItemId: e.catalogItemId || undefined,
      customLabel: e.customLabel || undefined,
      serialNumber: e.serialNumber || undefined,
      inventoryNumber: e.inventoryNumber || undefined,
      notes: e.notes || undefined,
      order: idx,
    })),
  };
}
