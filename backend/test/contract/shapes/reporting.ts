/** Formes vérifiées des contrats de src/contracts/inventory.ts et audit.ts. */
import type {
  AuditListResponse,
  AuditLogBonRef,
  AuditLogEntry,
  AuditLogResolvedUser,
  AuditLogUserRelation,
} from '../../../src/contracts/audit';
import type {
  EquipmentSituation,
  InventoryByCollaborateurResponse,
  InventoryCollaborateur,
  InventoryCollaborateurFiliale,
  InventoryCollaborateurItem,
  InventoryFiliale,
  InventoryItem,
  InventoryListResponse,
  InventorySummaryResponse,
  ParcCategoryCount,
  ParcFilialeCount,
  ParcSituationCount,
} from '../../../src/contracts/inventory';
import { enumOf, equipmentCategory } from '../support/common-shapes';
import {
  absent,
  arrayOf,
  bool,
  int,
  isoDate,
  json,
  literal,
  nullable,
  nullValue,
  num,
  object,
  oneOf,
  str,
  uuid,
} from '../support/shape';

export const equipmentSituation = enumOf<EquipmentSituation>({
  en_attente_signature: true,
  en_circulation: true,
  en_litige: true,
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
  bonStatus: parcBonStatus,
  situation: equipmentSituation,
  situationLabel: str,
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

export const inventoryList = object<InventoryListResponse>({
  items: arrayOf(inventoryItem, { minLength: 1 }),
  total: int,
  page: int,
  limit: int,
});

export const inventorySummary = object<InventorySummaryResponse>({
  total: int,
  byCategory: arrayOf(parcCategoryCount, { minLength: 1 }),
  byFiliale: arrayOf(parcFilialeCount, { minLength: 1 }),
  bySituation: arrayOf(parcSituationCount, { minLength: 3 }),
  overdue: int,
});

export const inventoryByCollaborateur = object<InventoryByCollaborateurResponse>({
  items: arrayOf(
    object<InventoryCollaborateurItem>({
      collaborateurId: uuid,
      displayName: str,
      email: nullable(str),
      department: nullable(str),
      filiale: nullable(object<InventoryCollaborateurFiliale>({ id: uuid, displayName: str })),
      active: bool,
      count: int,
      overdueCount: int,
      oldestDateMiseDisposition: isoDate,
      oldestAgeDays: num,
    }),
    { minLength: 1 },
  ),
  total: int,
  page: int,
  limit: int,
  truncated: bool,
});

const auditUser = oneOf(
  object<AuditLogUserRelation>({ id: uuid, displayName: str, email: nullable(str), resolved: absent }),
  object<AuditLogResolvedUser>({ id: nullValue, displayName: str, email: str, resolved: literal(true) }),
);

export const auditList = object<AuditListResponse>({
  logs: arrayOf(
    object<AuditLogEntry>({
      id: uuid,
      bonId: nullable(uuid),
      userId: nullable(uuid),
      userEmail: nullable(str),
      action: str,
      details: nullable(json),
      ipAddress: nullable(str),
      userAgent: nullable(str),
      createdAt: isoDate,
      bon: nullable(object<AuditLogBonRef>({ id: uuid, reference: str })),
      user: nullable(auditUser),
    }),
    { minLength: 1 },
  ),
  total: int,
  page: int,
  limit: int,
  exportLimit: int,
  exportTruncated: bool,
});
