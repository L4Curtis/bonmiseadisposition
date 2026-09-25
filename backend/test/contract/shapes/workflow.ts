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
  CorrectedBonRef,
  CreateContestationResponse,
  ResolveContestationResponse,
  ReviewContestationResponse,
} from '../../../src/contracts/contestations';
import type {
  CompletedLinkSignature,
  PendingLinkSignature,
  SignatureAlreadySignedResponse,
  SignatureBonClosedResponse,
  SignatureExpiredResponse,
  SignaturePendingResponse,
  SignatureReplacedResponse,
  SignatureUnauthorizedResponse,
  SignDocumentResponse,
} from '../../../src/contracts/signature';
import { bonStatus, contestationStatus } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, object, str, uuid } from '../support/shape';
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

export const signatureReplaced = object<SignatureReplacedResponse>({ status: literal('replaced'), reference: str });

export const signatureExpired = object<SignatureExpiredResponse>({ status: literal('expired'), reference: str });

export const signaturePending = object<SignaturePendingResponse>({
  status: literal('pending'),
  bon: bonForSignature,
  signature: object<PendingLinkSignature>({ ...safeSignatureFields, type: linkSignatureType, signed: literal(false) }),
});

export const signDocument = object<SignDocumentResponse>({
  ok: literal(true),
  bonId: uuid,
  signedByProxy: bool,
  bon: bonForSignature,
  signature: object<CompletedLinkSignature>({
    ...safeSignatureFields,
    type: linkSignatureType,
    signed: literal(true),
    signedAt: isoDate,
    pdfType: signaturePdfType,
    bonId: uuid,
    signedByProxy: bool,
  }),
});

// ─── Contestations ────────────────────────────────────────────────────────────

const contestationColumns = {
  id: uuid,
  bonId: uuid,
  userId: uuid,
  message: str,
  status: contestationStatus,
  resolvedById: nullable(uuid),
  resolutionMessage: nullable(str),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const author = object<ContestationAuthor>({ id: uuid, displayName: str, email: nullable(str) });
const handler = object<ContestationHandler>({ id: uuid, displayName: str });
const bonRef = object<ContestationBonRef>({ id: uuid, reference: str });

export const contestationList = object<ContestationListResponse>({
  contestations: arrayOf(
    object<ContestationListItem>({
      ...contestationColumns,
      bon: object<ContestationListBon>({
        id: uuid,
        reference: str,
        status: bonStatus,
        filiale: object<ContestationListBon['filiale']>({ displayName: str }),
      }),
      user: author,
      resolvedBy: nullable(handler),
    }),
    { minLength: 1 },
  ),
  total: int,
  page: int,
  limit: int,
  openCount: int,
});

export const createContestation = object<CreateContestationResponse>({
  ...contestationColumns,
  status: literal('open'),
  bon: bonRef,
  user: author,
});

export const reviewContestation = object<ReviewContestationResponse>({
  ...contestationColumns,
  status: literal('in_review'),
  resolvedById: uuid,
  bon: bonRef,
  user: author,
  resolvedBy: handler,
});

export const resolveContestation = object<ResolveContestationResponse>({
  ...contestationColumns,
  status: literal('resolved', 'rejected'),
  resolvedById: uuid,
  bon: object<ContestationBonWithStatus>({ id: uuid, reference: str, status: bonStatus }),
  user: author,
  resolvedBy: handler,
  correctedBon: nullable(object<CorrectedBonRef>({ id: uuid, reference: str })),
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
