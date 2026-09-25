/** Formes vérifiées des contrats de src/contracts/bons.ts. */
import type {
  BonCatalogItemSummary,
  BonCollaborateur,
  BonCreatedBy,
  BonDetail,
  BonEquipment,
  BonForSignature,
  BonFiliale,
  BonForSignatureEquipment,
  BonIntegrityResponse,
  BonListEquipment,
  BonListItem,
  BonListPendingSignature,
  BonListResponse,
  BonNotificationLog,
  BonStatsFiliale,
  BonStatsResponse,
  InitiateInPersonResponse,
  ItCachetSignature,
  MissingPdfSnapshotsResponse,
  PdfSnapshotInfo,
  PortalBon,
  PortalSignature,
  ResendBatchFailed,
  ResendBatchResponse,
  ResendBatchSent,
  ResendBatchSkipped,
  ResendLinkResponse,
  SafeSignature,
  SendSerialConflict,
  SerialConflictsErrorBody,
  SignatureIntegrity,
  SignItResponse,
  TokenRecentErrorBody,
} from '../../../src/contracts/bons';
import {
  bonStatus,
  civilite,
  equipmentCategory,
  notificationStatus,
  notificationType,
  pdfSnapshotType,
  signatureType,
} from '../support/common-shapes';
import {
  arrayOf,
  bool,
  int,
  isoDate,
  literal,
  nullable,
  object,
  oneOf,
  optional,
  str,
  uuid,
} from '../support/shape';
import { catalogItem } from './equipment';

export const signaturePdfType = literal('mise_disposition', 'restitution', 'pv_cloture');

/** Filiale complète ; `stampPath` n'est renvoyé qu'à l'IT (voir le contrat). */
const bonFiliale = object<BonFiliale>({
  id: uuid,
  name: str,
  displayName: str,
  logoPath: nullable(str),
  stampPath: optional(nullable(str)),
  address: nullable(str),
  siret: nullable(str),
  active: bool,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const collaborateur = object<BonCollaborateur>({ id: uuid, displayName: str, email: nullable(str), department: nullable(str) });
const createdBy = object<BonCreatedBy>({ id: uuid, displayName: str, email: nullable(str) });

/** Colonnes d'une ligne d'équipement, communes à la fiche et aux routes de signature. */
export const equipmentColumns = {
  id: uuid,
  bonId: uuid,
  catalogItemId: nullable(uuid),
  customLabel: nullable(str),
  serialNumber: nullable(str),
  inventoryNumber: nullable(str),
  notes: nullable(str),
  order: int,
  returnedAt: nullable(isoDate),
  notReturned: bool,
  notReturnedReason: nullable(str),
  createdAt: isoDate,
};

const bonEquipment = object<BonEquipment>({
  ...equipmentColumns,
  catalogItem: nullable(
    object<BonCatalogItemSummary>({ id: uuid, brand: str, model: str, category: equipmentCategory }),
  ),
});

export const safeSignatureFields = {
  id: uuid,
  type: signatureType,
  signed: bool,
  signedAt: nullable(isoDate),
  signerEmail: nullable(str),
  mentionLuApprouve: bool,
  isInPerson: bool,
  tokenExpiresAt: isoDate,
  createdAt: isoDate,
  pdfType: nullable(signaturePdfType),
};

export const safeSignature = object<SafeSignature>(safeSignatureFields);

/** Champs de la fiche, hors équipements et signatures (varient selon la route). */
export const bonDetailBaseFields = {
  id: uuid,
  reference: str,
  filialeId: uuid,
  collaborateurId: uuid,
  collaborateurEmail: nullable(str),
  createdById: uuid,
  civilite,
  status: bonStatus,
  dateMiseDisposition: isoDate,
  dateRestitution: nullable(isoDate),
  notes: nullable(str),
  createdAt: isoDate,
  updatedAt: isoDate,
  filiale: bonFiliale,
  collaborateur,
  createdBy,
};

export const bonDetail = object<BonDetail>({
  ...bonDetailBaseFields,
  equipments: arrayOf(bonEquipment, { minLength: 1 }),
  signatures: arrayOf(safeSignature),
});

export const bonForSignature = object<BonForSignature>({
  ...bonDetailBaseFields,
  equipments: arrayOf(object<BonForSignatureEquipment>({ ...equipmentColumns, catalogItem: nullable(catalogItem) }), {
    minLength: 1,
  }),
  signatures: arrayOf(safeSignature, { minLength: 1 }),
});

const bonListItem = object<BonListItem>({
  id: uuid,
  reference: str,
  status: bonStatus,
  collaborateurEmail: nullable(str),
  dateMiseDisposition: isoDate,
  dateRestitution: nullable(isoDate),
  createdAt: isoDate,
  updatedAt: isoDate,
  filiale: object<BonListItem['filiale']>({ id: uuid, displayName: str }),
  collaborateur: object<BonListItem['collaborateur']>({ id: uuid, displayName: str, email: nullable(str) }),
  createdBy: object<BonListItem['createdBy']>({ id: uuid, displayName: str }),
  equipments: arrayOf(
    object<BonListEquipment>({
      id: uuid,
      customLabel: nullable(str),
      serialNumber: nullable(str),
      inventoryNumber: nullable(str),
      catalogItem: nullable(object<NonNullable<BonListEquipment['catalogItem']>>({ id: uuid, brand: str, model: str })),
    }),
  ),
  signatures: arrayOf(object<BonListPendingSignature>({ type: signatureType, signed: literal(false), createdAt: isoDate })),
});

export const bonList = object<BonListResponse>({
  bons: arrayOf(bonListItem, { minLength: 1 }),
  total: int,
  page: int,
  limit: int,
});

export const bonStats = object<BonStatsResponse>({
  waitingSignature: int,
  active: int,
  overdue: int,
  total: int,
  archivedThisMonth: int,
  partiallyReturned: int,
  overdueThresholdDays: int,
  byFiliale: arrayOf(object<BonStatsFiliale>({ id: uuid, name: str, count: int }), { minLength: 1 }),
});

export const recentBons = arrayOf(bonDetail, { minLength: 1 });

const portalSignature = object<PortalSignature>({
  ...safeSignatureFields,
  token: optional(str),
  inPersonPending: optional(literal(true)),
});

export const myBons = arrayOf(
  object<PortalBon>({ ...bonDetailBaseFields, equipments: arrayOf(bonEquipment), signatures: arrayOf(portalSignature) }),
  { minLength: 1 },
);

export const bonNotifications = arrayOf(
  object<BonNotificationLog>({
    id: uuid,
    bonId: uuid,
    recipientEmail: str,
    type: notificationType,
    sentAt: isoDate,
    status: notificationStatus,
    errorMessage: nullable(str),
    reminderNumber: nullable(int),
  }),
  { minLength: 1 },
);

export const bonIntegrity = object<BonIntegrityResponse>({
  allValid: bool,
  anonymized: bool,
  signatures: arrayOf(
    object<SignatureIntegrity>({
      id: uuid,
      type: signatureType,
      signed: literal(true),
      sealed: bool,
      sealValid: nullable(bool),
      timestamped: bool,
      timestampAuthority: nullable(str),
      signedAt: nullable(isoDate),
    }),
    { minLength: 1 },
  ),
});

export const pdfSnapshots = arrayOf(
  object<PdfSnapshotInfo>({ type: pdfSnapshotType, filename: str, createdAt: isoDate, sha256: nullable(str) }),
  { minLength: 1 },
);

export const missingPdfSnapshots = object<MissingPdfSnapshotsResponse>({ missing: arrayOf(pdfSnapshotType) });

export const initiateInPerson = object<InitiateInPersonResponse>({ bon: bonDetail, token: str });

export const signIt = object<SignItResponse>({
  ok: literal(true),
  bon: bonForSignature,
  signature: object<ItCachetSignature>({
    ...safeSignatureFields,
    type: literal('it_cachet'),
    signed: literal(true),
    signedAt: isoDate,
    pdfType: nullable(literal('mise_disposition', 'restitution')),
  }),
});

export const resendLink = object<ResendLinkResponse>({ ok: literal(true), message: str });

export const resendBatch = object<ResendBatchResponse>({
  results: arrayOf(
    oneOf(
      object<ResendBatchSent>({ id: uuid, outcome: literal('sent') }),
      object<ResendBatchSkipped>({
        id: uuid,
        outcome: literal('skipped'),
        reason: str,
        code: optional(literal('token_recent')),
        sentAt: optional(isoDate),
      }),
      object<ResendBatchFailed>({ id: uuid, outcome: literal('failed'), reason: str }),
    ),
    { minLength: 1 },
  ),
  sent: int,
  skipped: int,
  failed: int,
});

export const serialConflictsError = object<SerialConflictsErrorBody>({
  code: literal('serial_conflicts'),
  conflicts: arrayOf(object<SendSerialConflict>({ serialNumber: str, bonReference: str }), { minLength: 1 }),
});

export const tokenRecentError = object<TokenRecentErrorBody>({ code: literal('token_recent'), sentAt: isoDate });
