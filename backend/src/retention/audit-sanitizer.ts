import { Prisma } from '@prisma/client';

// Clés JSON pouvant contenir des PII dans AuditLog.details, retirées à l'anonymisation
// — 'message' : bon_contested stocke message.substring(0,200) (texte libre du collaborateur)
// — 'reason' : declare_not_returned / bon_closed_unilateral stockent un motif libre
const AUDIT_DETAILS_PII_KEYS = ['filename', 'titulaireEmail', 'signerEmail', 'email', 'message', 'reason'];

/** Retire du JSON `details` d'un AuditLog les clés pouvant porter des PII. */
export function sanitizeAuditDetails(details: Prisma.JsonValue): Prisma.JsonValue {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return details;
  let changed = false;
  const clone: Record<string, Prisma.JsonValue> = { ...(details as Record<string, Prisma.JsonValue>) };
  for (const key of AUDIT_DETAILS_PII_KEYS) {
    if (key in clone) {
      delete clone[key];
      changed = true;
    }
  }
  return changed ? clone : details;
}
