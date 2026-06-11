import { Prisma, BonStatus, Civilite, SignatureType, PdfSnapshotType, UserRole, NotificationType } from '@prisma/client';

// Re-export Prisma enums for convenient access across the backend
export { BonStatus, Civilite, SignatureType, PdfSnapshotType, UserRole, NotificationType };

/**
 * Signature fields safe to expose in API responses. Excludes the active token
 * (a signing secret), signerIp/signerUserAgent (PII used only for the audit
 * trail / PDFs) and signatureImagePath (internal storage detail).
 */
export const SIGNATURE_SAFE_SELECT = {
  id: true,
  type: true,
  signed: true,
  signedAt: true,
  signerEmail: true,
  mentionLuApprouve: true,
  isInPerson: true,
  tokenExpiresAt: true,
  createdAt: true,
} as const;

/**
 * The canonical select shape used by BonsService for listing / detail queries.
 * Avoids loading large Bytes columns (pdfMiseDispoSnapshot, pdfRestitutionSnapshot)
 * and restricts signatures to API-safe fields.
 */
export const BON_SELECT_SHAPE = {
  select: {
    id: true,
    reference: true,
    filialeId: true,
    collaborateurId: true,
    collaborateurEmail: true,
    createdById: true,
    civilite: true,
    status: true,
    dateMiseDisposition: true,
    dateRestitution: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    filiale: true,
    collaborateur: {
      select: { id: true, displayName: true, email: true, department: true },
    },
    createdBy: {
      select: { id: true, displayName: true, email: true },
    },
    equipments: {
      orderBy: { order: 'asc' as const },
      include: {
        catalogItem: {
          select: { id: true, brand: true, model: true, category: true },
        },
      },
    },
    signatures: { select: SIGNATURE_SAFE_SELECT },
  },
} as const;

/** Type of a Bon loaded via BON_SELECT_SHAPE (with relations). */
export type BonWithRelations = Prisma.BonGetPayload<typeof BON_SELECT_SHAPE>;

/** Strip a full signature record down to the API-safe fields. */
export function toSafeSignature<T extends Record<string, unknown>>(sig: T) {
  return {
    id: sig.id,
    type: sig.type,
    signed: sig.signed,
    signedAt: sig.signedAt,
    signerEmail: sig.signerEmail,
    mentionLuApprouve: sig.mentionLuApprouve,
    isInPerson: sig.isInPerson,
    tokenExpiresAt: sig.tokenExpiresAt,
    createdAt: sig.createdAt,
  };
}

/**
 * Sanitize a bon loaded with full relations (Prisma `include`) before returning
 * it in an HTTP response: drops the legacy Bytes snapshot columns and reduces
 * signatures to their API-safe fields.
 */
export function sanitizeBonForResponse<T extends { signatures?: Record<string, unknown>[] }>(bon: T) {
  if (!bon) return bon;
  const {
    pdfMiseDispoSnapshot: _b1,
    pdfMiseDispoSnapshotAt: _b2,
    pdfRestitutionSnapshot: _b3,
    pdfRestitutionSnapshotAt: _b4,
    ...rest
  } = bon as T & {
    pdfMiseDispoSnapshot?: unknown;
    pdfMiseDispoSnapshotAt?: unknown;
    pdfRestitutionSnapshot?: unknown;
    pdfRestitutionSnapshotAt?: unknown;
  };
  return {
    ...rest,
    signatures: bon.signatures?.map((s) => toSafeSignature(s)),
  };
}

/** Type of a single equipment entry within BonWithRelations. */
export type BonEquipmentWithCatalog = BonWithRelations['equipments'][number];

/**
 * Minimal bon shape expected by NotificationService methods.
 * Avoids coupling notification logic to the full Prisma query shape.
 */
export interface NotificationBon {
  id: string;
  reference: string;
  civilite: Civilite;
  collaborateurEmail: string;
  dateMiseDisposition?: Date | string;
  collaborateur?: { displayName?: string; email?: string } | null;
  filiale?: { displayName?: string; name?: string } | null;
  equipments?: Array<{
    id: string;
    order: number;
    catalogItem?: { brand: string; model: string } | null;
    customLabel?: string | null;
    serialNumber?: string | null;
    returnedAt?: Date | string | null;
    notReturned?: boolean;
    notReturnedReason?: string | null;
  }>;
  status?: BonStatus;
  signatures?: Array<{
    type: string;
    signed: boolean;
    signedAt?: Date | string | null;
    signatureImagePath?: string | null;
    tokenExpiresAt?: Date | string;
  }>;
}

/**
 * Minimal bon shape expected by SmbService.exportPdf.
 */
export interface SmbBon {
  id?: string;
  reference: string;
  createdAt?: Date | string;
  filiale?: { displayName?: string; name?: string } | null;
  collaborateur?: { displayName?: string } | null;
}

/**
 * Shape for signature entries used by SignatureService helper methods.
 */
export interface SignatureEntry {
  type: string;
  signed: boolean;
  signedAt?: Date | string | null;
  signatureImagePath?: string | null;
}
