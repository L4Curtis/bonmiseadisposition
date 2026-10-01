/** Formes vérifiées des contrats de src/contracts/audit.ts. */
import type {
  AuditListMeta,
  AuditLogBonRef,
  AuditLogEntry,
  AuditLogResolvedUser,
  AuditLogUserRelation,
} from '../../../src/contracts/audit';
import { listOf, listWithMeta } from '../support/common-shapes';
import { absent, bool, int, isoDate, json, literal, nullable, nullValue, object, oneOf, str, uuid } from '../support/shape';

const auditUser = oneOf(
  object<AuditLogUserRelation>({ id: uuid, displayName: str, email: nullable(str), resolved: absent }),
  object<AuditLogResolvedUser>({ id: nullValue, displayName: str, email: str, resolved: literal(true) }),
);

export const auditEntry = object<AuditLogEntry>({
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
});

export const auditList = listWithMeta(
  auditEntry,
  object<AuditListMeta>({ exportLimit: int, exportTruncated: bool }),
  { minLength: 1 },
);

export const auditActions = listOf(str, { minLength: 1 });
