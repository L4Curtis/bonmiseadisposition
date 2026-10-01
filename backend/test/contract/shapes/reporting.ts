/** Formes vérifiées des contrats de src/contracts/inventory.ts. */
import type {
  EquipmentSituation,
  InventoryByCollaborateurResponse,
  InventoryCollaborateur,
  InventoryCollaborateurFiliale,
  InventoryCollaborateurItem,
  InventoryFiliale,
  InventoryItem,
  InventoryListMeta,
  InventoryListResponse,
  InventorySituation,
  InventorySummaryResponse,
  ParcCategoryCount,
  ParcFilialeCount,
  ParcSituationCount,
} from '../../../src/contracts/inventory';
import { bonStatus, enumOf, equipmentCategory, listOf, listWithMeta } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, num, object, Shape, str, uuid } from '../support/shape';

export const equipmentSituation = enumOf<EquipmentSituation>({
  en_attente_signature: true,
  en_circulation: true,
  en_litige: true,
});

/** Situation d'une ligne de l'inventaire : celles du parc, ou « Non restitué ». */
export const inventorySituation = enumOf<InventorySituation>({
  en_attente_signature: true,
  en_circulation: true,
  en_litige: true,
  non_restitue: true,
});

export const parcBonStatus = literal('sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested');

export const parcCategoryCount = object<ParcCategoryCount>({ category: equipmentCategory, label: str, count: int });
export const parcFilialeCount = object<ParcFilialeCount>({ filialeId: uuid, name: str, count: int });
export const parcSituationCount = object<ParcSituationCount>({ situation: equipmentSituation, label: str, count: int });

const inventoryItem = object<InventoryItem>({
  equipmentId: uuid,
  label: str,
  category: equipmentCategory,
  categoryLabel: str,
  serialNumber: nullable(str),
  inventoryNumber: nullable(str),
  bonId: uuid,
  bonReference: str,
  bonStatus,
  situation: inventorySituation,
  situationLabel: str,
  notReturnedReason: nullable(str),
  dateMiseDisposition: isoDate,
  dateRestitution: nullable(isoDate),
  collaborateur: object<InventoryCollaborateur>({
    id: uuid,
    displayName: str,
    email: nullable(str),
    department: nullable(str),
    active: bool,
  }),
  filiale: object<InventoryFiliale>({ id: uuid, name: str, displayName: str }),
});

/** Forme unique des listes ; le plafond de l'export dans `meta`. */
export const inventoryList: Shape<InventoryListResponse> = listWithMeta<InventoryItem, InventoryListMeta>(
  inventoryItem,
  object<InventoryListMeta>({ exportLimit: int }),
  { minLength: 1 },
);

export const inventorySummary = object<InventorySummaryResponse>({
  total: int,
  byCategory: arrayOf(parcCategoryCount, { minLength: 1 }),
  byFiliale: arrayOf(parcFilialeCount, { minLength: 1 }),
  bySituation: arrayOf(parcSituationCount, { minLength: 3 }),
  overdueReturns: int,
  overdue: int,
  notReturned: int,
});

/** Forme unique des listes, sans `meta`. */
export const inventoryByCollaborateur: Shape<InventoryByCollaborateurResponse> = listOf<InventoryCollaborateurItem>(
  object<InventoryCollaborateurItem>({
    collaborateurId: uuid,
    displayName: str,
    email: nullable(str),
    department: nullable(str),
    filiale: nullable(object<InventoryCollaborateurFiliale>({ id: uuid, displayName: str })),
    active: bool,
    count: int,
    overdueReturns: int,
    overdueCount: int,
    oldestDateMiseDisposition: isoDate,
    oldestAgeDays: num,
  }),
  { minLength: 1 },
);
