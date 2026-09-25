/** Formes vérifiées des contrats de src/contracts/equipment.ts. */
import type {
  CatalogImportError,
  CatalogImportResult,
  CatalogItem,
  EquipmentHistoryBon,
  EquipmentHistoryEntry,
  EquipmentHistoryResponse,
  Pack,
  PackItem,
  PackRecord,
  SerialConflict,
  SerialConflictsResponse,
} from '../../../src/contracts/equipment';
import { bonStatus, equipmentCategory } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, object, str, uuid } from '../support/shape';

export const catalogItem = object<CatalogItem>({
  id: uuid,
  category: equipmentCategory,
  brand: str,
  model: str,
  description: nullable(str),
  active: bool,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const catalogImportResult = object<CatalogImportResult>({
  created: int,
  updated: int,
  skipped: int,
  errors: arrayOf(object<CatalogImportError>({ index: int, message: str })),
});

const packRecordFields = {
  id: uuid,
  name: str,
  description: nullable(str),
  active: bool,
  createdAt: isoDate,
  updatedAt: isoDate,
};

export const packRecord = object<PackRecord>(packRecordFields);

const packItem = object<PackItem>({
  id: uuid,
  packId: uuid,
  catalogItemId: uuid,
  quantity: int,
  order: int,
  catalogItem,
});

export const pack = object<Pack>({ ...packRecordFields, items: arrayOf(packItem) });

const historyBon = object<EquipmentHistoryBon>({
  id: uuid,
  reference: str,
  status: bonStatus,
  dateMiseDisposition: isoDate,
  dateRestitution: nullable(isoDate),
  collaborateur: object<EquipmentHistoryBon['collaborateur']>({ displayName: str, email: nullable(str) }),
  filiale: object<EquipmentHistoryBon['filiale']>({ displayName: str }),
});

export const equipmentHistory = object<EquipmentHistoryResponse>({
  items: arrayOf(
    object<EquipmentHistoryEntry>({
      equipmentId: uuid,
      serialNumber: nullable(str),
      inventoryNumber: nullable(str),
      label: nullable(str),
      returnedAt: nullable(isoDate),
      notReturned: bool,
      bon: historyBon,
    }),
    { minLength: 1 },
  ),
  truncated: bool,
  total: int,
});

export const serialConflicts = object<SerialConflictsResponse>({
  items: arrayOf(
    object<SerialConflict>({
      serialNumber: str,
      bonId: uuid,
      bonReference: str,
      bonStatus: literal('draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested'),
      collaborateur: str,
    }),
    { minLength: 1 },
  ),
  truncated: bool,
});
