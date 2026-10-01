/** Formes vérifiées des contrats de src/contracts/signature.ts,
 *  contestations.ts et attachments.ts. */
import type { BonAttachment } from '../../../src/contracts/attachments';
import type {
  ContestationAuthor,
  ContestationBonRef,
  ContestationBonWithStatus,
  ContestationHandler,
  ContestationListBon,
  ContestationListItem,
  ContestationListResponse,
  CreateContestationResponse,
  MyContestation,
  ReplacementBonRef,
  ResolveContestationResponse,
  ReviewContestationResponse,
} from '../../../src/contracts/contestations';
import type {
  CompletedLinkSignature,
  RequestNewLinkResponse,
  PendingLinkSignature,
  SignatureAlreadySignedResponse,
  SignatureBonClosedResponse,
  SignatureExpiredResponse,
  SignaturePendingResponse,
  SignatureReplacedResponse,
  SignatureUnauthorizedResponse,
  SignDocumentResponse,
} from '../../../src/contracts/signature';
import {
  bonStatus,
  contestationOutcome,
  contestationStatus,
  signatureInvalidationReason,
} from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, object, optional, str, uuid } from '../support/shape';
import { bonForSignature, safeSignatureFields, signaturePdfType } from './bons';

// ─── Signature par lien ───────────────────────────────────────────────────────

const linkSignatureType = literal('mise_disposition', 'restitution', 'pv_cloture');

export const signatureUnauthorized = object<SignatureUnauthorizedResponse>({ status: literal('unauthorized') });

export const signatureBonClosed = object<SignatureBonClosedResponse>({
  status: literal('cancelled', 'contested'),
  reference: str,
});

export const signatureAlreadySigned = object<SignatureAlreadySignedResponse>({
  status: literal('already_signed'),
  reference: str,
  bonId: uuid,
});

export const signatureReplaced = object<SignatureReplacedResponse>({
  status: literal('replaced'),
  reference: str,
  invalidatedReason: optional(nullable(signatureInvalidationReason)),
  // Toujours renvoyés par le serveur : la page de signature en dépend.
  documentType: linkSignatureType,
  followUp: literal('link_sent', 'in_person', 'link_coming', 'none'),
});

export const signatureExpired = object<SignatureExpiredResponse>({
  status: literal('expired'),
  reference: str,
  newLinkRequestedAt: optional(nullable(isoDate)),
});

export const requestNewLink = object<RequestNewLinkResponse>({
  ok: literal(true),
  status: literal('requested', 'already_requested'),
  requestedAt: isoDate,
});

export const signaturePending = object<SignaturePendingResponse>({
  status: literal('pending'),
  bon: bonForSignature,
  signature: object<PendingLinkSignature>({ ...safeSignatureFields, type: linkSignatureType, signed: literal(false) }),
});

export const signDocument = object<SignDocumentResponse>({
  ok: literal(true),
  bonId: uuid,
  signedByProxy: bool,
  witnessedByIt: bool,
  bon: bonForSignature,
  signature: object<CompletedLinkSignature>({
    ...safeSignatureFields,
    type: linkSignatureType,
    signed: literal(true),
    signedAt: isoDate,
    pdfType: signaturePdfType,
    bonId: uuid,
    signedByProxy: bool,
    witnessedByIt: bool,
  }),
});

// ─── Contestations ────────────────────────────────────────────────────────────

const contestationColumns = {
  id: uuid,
  bonId: uuid,
  userId: uuid,
  message: str,
  status: contestationStatus,
  previousBonStatus: nullable(bonStatus),
  contestedDocument: nullable(linkSignatureType),
  outcome: nullable(contestationOutcome),
  reviewedById: nullable(uuid),
  reviewedAt: nullable(isoDate),
  resolvedById: nullable(uuid),
  resolvedAt: nullable(isoDate),
  resolutionMessage: nullable(str),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const author = object<ContestationAuthor>({ id: uuid, displayName: str, email: nullable(str) });
const handler = object<ContestationHandler>({ id: uuid, displayName: str });
const bonRef = object<ContestationBonRef>({ id: uuid, reference: str });
const bonWithStatus = object<ContestationBonWithStatus>({ id: uuid, reference: str, status: bonStatus });

const people = {
  user: author,
  reviewedBy: nullable(handler),
  resolvedBy: nullable(handler),
};

export const contestationList = object<ContestationListResponse>({
  contestations: arrayOf(
    object<ContestationListItem>({
      ...contestationColumns,
      ...people,
      bon: object<ContestationListBon>({
        id: uuid,
        reference: str,
        status: bonStatus,
        filiale: object<ContestationListBon['filiale']>({ displayName: str }),
      }),
    }),
    { minLength: 1 },
  ),
  total: int,
  page: int,
  limit: int,
  openCount: int,
  pendingCount: int,
  overdueCount: int,
  overdueAfterDays: int,
  overdueSince: isoDate,
});

export const myContestations = arrayOf(
  object<MyContestation>({
    id: uuid,
    bon: bonRef,
    contestedDocument: nullable(linkSignatureType),
    message: str,
    status: contestationStatus,
    outcome: nullable(contestationOutcome),
    createdAt: isoDate,
    reviewedAt: nullable(isoDate),
    resolvedAt: nullable(isoDate),
    resolutionMessage: nullable(str),
    replacementBon: nullable(bonRef),
  }),
  { minLength: 1 },
);

export const createContestation = object<CreateContestationResponse>({
  ...contestationColumns,
  status: literal('open'),
  contestedDocument: linkSignatureType,
  previousBonStatus: bonStatus,
  bon: bonRef,
  user: author,
});

export const reviewContestation = object<ReviewContestationResponse>({
  ...contestationColumns,
  ...people,
  status: literal('in_review'),
  reviewedById: uuid,
  reviewedAt: isoDate,
  reviewedBy: handler,
  bon: bonWithStatus,
});

export const resolveContestation = object<ResolveContestationResponse>({
  ...contestationColumns,
  ...people,
  status: literal('resolved', 'rejected'),
  outcome: contestationOutcome,
  resolvedById: uuid,
  resolvedAt: isoDate,
  resolvedBy: handler,
  bon: bonWithStatus,
  replacementBon: nullable(object<ReplacementBonRef>({ id: uuid, reference: str, status: bonStatus })),
  reopenedDocument: nullable(literal('restitution', 'pv_cloture')),
});

// ─── Pièces jointes ───────────────────────────────────────────────────────────

export const attachment = object<BonAttachment>({
  id: uuid,
  bonId: uuid,
  stage: literal('mise_disposition', 'restitution', 'pv_cloture', 'general'),
  filename: str,
  mimeType: literal('image/png', 'image/jpeg', 'image/webp', 'application/pdf'),
  size: int,
  sha256: str,
  label: nullable(str),
  uploadedByEmail: nullable(str),
  createdAt: isoDate,
});
