/** Formes vérifiées des contrats de src/contracts/bons.ts. */
import type {
  BonActionName,
  BonAvailableAction,
  BonCatalogItemSummary,
  BonCollaborateur,
  BonContestationNotice,
  BonCreatedBy,
  BonDetail,
  BonEquipment,
  BonForSignature,
  BonFiliale,
  BonForSignatureEquipment,
  BonHistoryEntry,
  BonIntegrityResponse,
  BonLateness,
  BonListEquipment,
  BonListItem,
  BonListMeta,
  BonListPendingSignature,
  BonListResponse,
  BonLinkRequest,
  BonNotificationLog,
  BonRef,
  BonStatsFiliale,
  BonSubStatus,
  BonStatsResponse,
  EquipmentReturnState,
  InitiateInPersonResponse,
  ItCachetSignature,
  LinkRefusal,
  LinkSignatureType,
  LinkRefusalReason,
  MissingPdfSnapshotsResponse,
  MissingSerialLine,
  MissingSerialsErrorBody,
  PendingSignature,
  PdfSnapshotInfo,
  PortalBon,
  PortalSignature,
  ResendBatchFailed,
  ResendBatchResponse,
  ResendBatchSent,
  ResendBatchSkipped,
  ResendLinkResponse,
  SafeSignature,
  SendChecksResponse,
  SendSerialConflict,
  SerialConflictsErrorBody,
  SignatureIntegrity,
  SignItResponse,
  TokenRecentErrorBody,
} from '../../../src/contracts/bons';
import {
  bonStatus,
  civilite,
  enumOf,
  equipmentCategory,
  errorMessage,
  listOf,
  listWithMeta,
  notificationStatus,
  notificationType,
  pdfSnapshotType,
  signatureInvalidationReason,
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
  type Shape,
  optional,
  str,
  uuid,
} from '../support/shape';
import { catalogItem } from './equipment';

export const signaturePdfType = literal('mise_disposition', 'restitution', 'pv_cloture');

// ─── Champs de la vague 2 (facultatifs le temps de la vague, voir le contrat) ─

const bonSubStatus = enumOf<BonSubStatus>({
  pv_to_sign: true,
  partial_restitution_to_sign: true,
  loss_declared: true,
  equipment_still_out: true,
});

const pendingSignature = object<PendingSignature>({
  type: signaturePdfType,
  expired: bool,
  inPerson: bool,
  itSigned: bool,
  sentAt: nullable(isoDate),
  expiresAt: nullable(isoDate),
  // Fiche et portail seulement (la liste IT ne la calcule pas).
  newLinkRequestedAt: optional(nullable(isoDate)),
});

const bonLateness = object<BonLateness>({ signatureDays: nullable(int), returnDays: nullable(int) });

const bonActionName = enumOf<BonActionName>({
  edit: true,
  send: true,
  send_in_person: true,
  resend: true,
  show_in_person_link: true,
  start_restitution: true,
  restitution_in_person: true,
  undo_return: true,
  declare_not_returned: true,
  mark_found: true,
  handover_without_signature: true,
  close_without_signature: true,
  cancel: true,
});

const availableAction = object<BonAvailableAction>({
  action: bonActionName,
  primary: bool,
  blockedReason: nullable(str),
});

const equipmentReturnState = enumOf<EquipmentReturnState>({
  out: true,
  returned_to_sign: true,
  returned: true,
  not_returned: true,
  replaced: true,
});

const linkRefusal = object<LinkRefusal>({
  reason: enumOf<LinkRefusalReason>({ inactive_account: true, no_email: true, undeliverable_email: true }),
  message: str,
});

const bonRef = object<BonRef>({ id: uuid, reference: str });

const reopenableDocument = enumOf<LinkSignatureType>({ mise_disposition: true, restitution: true, pv_cloture: true });

const contestationNotice = object<BonContestationNotice>({
  id: uuid,
  stage: enumOf<BonContestationNotice['stage']>({ open: true, correction: true }),
  message: str,
  createdAt: isoDate,
  contestedDocument: nullable(reopenableDocument),
  reviewedBy: nullable(object<{ id: string; displayName: string }>({ id: uuid, displayName: str })),
  resolvedAt: nullable(isoDate),
  resolutionMessage: nullable(str),
});

const linkRequest = object<BonLinkRequest>({ requestedAt: isoDate, documentType: reopenableDocument });

/** Champs de la fiche ajoutés par la vague 2, visibles du titulaire. */
const wave2BonFields = {
  subStatus: optional(nullable(bonSubStatus)),
  pendingSignature: optional(nullable(pendingSignature)),
  awaitingSince: optional(nullable(isoDate)),
  cancellationReason: optional(nullable(str)),
  handoverWithoutSignatureReason: optional(nullable(str)),
  closedWithoutSignatureReason: optional(nullable(str)),
  replaces: optional(nullable(bonRef)),
  replacedBy: optional(nullable(bonRef)),
  lateness: optional(bonLateness),
  collaborateurActive: optional(bool),
};

/** Champs réservés à l'IT (`BonItOnlyField`) : absents du portail et de la
 *  page de signature, que les formes de ces routes refusent. */
const itOnlyBonFields = {
  internalNote: optional(nullable(str)),
  linkRefusal: optional(nullable(linkRefusal)),
  availableActions: optional(arrayOf(availableAction)),
  contestation: optional(nullable(contestationNotice)),
  linkRequest: optional(nullable(linkRequest)),
};

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

const collaborateur = object<BonCollaborateur>({
  id: uuid,
  displayName: str,
  email: nullable(str),
  department: nullable(str),
  civilite: optional(nullable(civilite)),
});
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
  returnState: optional(equipmentReturnState),
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
  invalidatedAt: optional(nullable(isoDate)),
  invalidatedReason: optional(nullable(signatureInvalidationReason)),
  signedByProxy: optional(bool),
  signerName: optional(nullable(str)),
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
  ...wave2BonFields,
};

export const bonDetail = object<BonDetail>({
  ...bonDetailBaseFields,
  ...itOnlyBonFields,
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
  subStatus: optional(nullable(bonSubStatus)),
  pendingSignature: optional(nullable(pendingSignature)),
  lateness: optional(bonLateness),
  canSendLink: optional(bool),
});

export const bonList: Shape<BonListResponse> = listWithMeta(
  bonListItem,
  object<BonListMeta>({ exportLimit: int }),
  { minLength: 1 },
);

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


const portalSignature = object<PortalSignature>({
  ...safeSignatureFields,
  token: optional(str),
  inPersonPending: optional(literal(true)),
});

export const myBons = listOf(
  object<PortalBon>({ ...bonDetailBaseFields, equipments: arrayOf(bonEquipment), signatures: arrayOf(portalSignature) }),
  { minLength: 1 },
);

export const bonNotifications = listOf(
  object<BonNotificationLog>({
    id: uuid,
    bonId: uuid,
    recipientEmail: str,
    type: notificationType,
    sentAt: isoDate,
    status: notificationStatus,
    errorMessage: nullable(str),
    reminderNumber: nullable(int),
    documentType: nullable(signaturePdfType),
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

export const pdfSnapshots = listOf(
  object<PdfSnapshotInfo>({
    id: str,
    type: pdfSnapshotType,
    filename: str,
    createdAt: isoDate,
    sha256: nullable(str),
    signatureType: nullable(signatureType),
    sequence: int,
    sequenceCount: int,
    latest: bool,
    supersededAt: nullable(isoDate),
    supersededReason: nullable(signatureInvalidationReason),
  }),
  { minLength: 1 },
);

export const missingPdfSnapshots = object<MissingPdfSnapshotsResponse>({ missing: arrayOf(pdfSnapshotType) });

/** Historique d'un bon : phrase du catalogue, jamais d'IP ni de navigateur. */
export const bonHistory = listOf(
  object<BonHistoryEntry>({
    id: uuid,
    at: isoDate,
    action: str,
    label: str,
    tone: literal('action', 'success', 'warning', 'failure', 'technical'),
    sentence: str,
    actorName: nullable(str),
  }),
  { minLength: 1 },
);

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

/** 409 des bons : forme d'erreur unique, données dans `details`. */
const serialConflictList = arrayOf(object<SendSerialConflict>({ serialNumber: str, bonReference: str }), { minLength: 1 });

export const serialConflictsError = object<SerialConflictsErrorBody>({
  statusCode: int,
  code: literal('serial_conflicts'),
  message: errorMessage,
  details: object<SerialConflictsErrorBody['details']>({ conflicts: serialConflictList }),
});

export const tokenRecentError = object<TokenRecentErrorBody>({
  statusCode: int,
  code: literal('token_recent'),
  message: errorMessage,
  details: object<TokenRecentErrorBody['details']>({ sentAt: isoDate }),
});

const missingSerialLine = object<MissingSerialLine>({ equipmentId: uuid, position: int, label: str });
const missingSerialLines = arrayOf(missingSerialLine, { minLength: 1 });

export const missingSerialsError = object<MissingSerialsErrorBody>({
  statusCode: int,
  code: literal('missing_serials'),
  message: errorMessage,
  details: object<MissingSerialsErrorBody['details']>({ lines: missingSerialLines }),
});

export const sendChecks = object<SendChecksResponse>({
  missingSerials: arrayOf(missingSerialLine),
  serialConflicts: arrayOf(object<SendSerialConflict>({ serialNumber: str, bonReference: str })),
});
