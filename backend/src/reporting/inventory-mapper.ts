import { Prisma, EquipmentCategory } from '@prisma/client';
import { CATEGORY_LABELS, SITUATION_LABELS, situationForBonStatus } from '../common/bon-predicates';

/** Sélection Prisma commune à la liste paginée et à l'export CSV de
 *  l'inventaire — isolée ici pour que `InventoryRow` (le type de ligne brute)
 *  et `toInventoryItem` (sa transformation) restent définis au même endroit. */
export const ITEM_SELECT = {
  id: true,
  customLabel: true,
  serialNumber: true,
  inventoryNumber: true,
  catalogItem: { select: { category: true, brand: true, model: true } },
  bon: {
    select: {
      id: true,
      reference: true,
      status: true,
      dateMiseDisposition: true,
      dateRestitution: true,
      // `active` : état du compte, pour signaler un compte désactivé sur la vue
      // par équipement comme sur la vue par collaborateur (même source serveur).
      collaborateur: { select: { id: true, displayName: true, email: true, department: true, active: true } },
      filiale: { select: { id: true, name: true, displayName: true } },
    },
  },
} satisfies Prisma.BonEquipmentSelect;

export type InventoryRow = Prisma.BonEquipmentGetPayload<{ select: typeof ITEM_SELECT }>;

/** Transforme une ligne `BonEquipment` (+ relations) vers la forme consommée
 *  par le frontend (`GET /reporting/inventory`) et par l'export CSV. */
export function toInventoryItem(row: InventoryRow) {
  const category = row.catalogItem?.category ?? EquipmentCategory.autre;
  const label = row.catalogItem
    ? `${row.catalogItem.brand} ${row.catalogItem.model}`
    : row.customLabel ?? 'Équipement';

  const situation = situationForBonStatus(row.bon.status);
  if (!situation) {
    // Ne doit jamais arriver : buildWhere restreint bon.status aux statuts
    // couverts par PARC_BON_STATUSES (voir buildParcEquipmentWhere).
    throw new Error(`Statut de bon hors du parc en circulation dans l'inventaire : ${row.bon.status}`);
  }

  return {
    equipmentId: row.id,
    label,
    category,
    categoryLabel: CATEGORY_LABELS[category] ?? category,
    serialNumber: row.serialNumber,
    inventoryNumber: row.inventoryNumber,
    bonId: row.bon.id,
    bonReference: row.bon.reference,
    bonStatus: row.bon.status,
    situation,
    situationLabel: SITUATION_LABELS[situation],
    dateMiseDisposition: row.bon.dateMiseDisposition,
    dateRestitution: row.bon.dateRestitution,
    collaborateur: row.bon.collaborateur,
    filiale: row.bon.filiale,
  };
}

export type InventoryItemView = ReturnType<typeof toInventoryItem>;
