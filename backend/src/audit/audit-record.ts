/**
 * Écriture d'une entrée du journal d'audit : LE seul endroit qui appelle
 * `auditLog.create` (voir le test « écritures directes restantes »,
 * `__tests__/audit-direct-writes.spec.ts`).
 *
 * `AuditService.record` l'appelle avec Prisma ; une fonction de workflow qui
 * tient déjà une transaction l'appelle avec elle, pour que l'entrée soit
 * annulée avec l'opération qu'elle raconte.
 */
import type { Prisma } from '@prisma/client';
import { isAuditAction } from './audit-actions';
import type { AuditAction } from './audit-actions';

/** Ce que l'on trace d'une action. Tout est facultatif : une tâche planifiée
 *  n'a pas d'auteur, une action d'administration n'a pas de bon. */
export interface AuditEntryInput {
  /** Compte qui a agi (colonne `user_id`). */
  readonly actorId?: string | null;
  /** Email de l'auteur, quand il n'a pas de compte lié (connexion refusée…). */
  readonly actorEmail?: string | null;
  readonly bonId?: string | null;
  /** Données utiles à la phrase du catalogue. Jamais de secret. */
  readonly details?: Prisma.InputJsonObject;
  /** Adresse du client, toujours lue par `clientIp(req)`. */
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/** Client qui sait écrire une entrée : PrismaService ou une transaction. */
export interface AuditWriter {
  readonly auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
}

/** Longueur maximale d'un user-agent conservé : l'en-tête est libre et peut
 *  peser plusieurs kilo-octets, recopiés sinon à chaque ligne du journal. */
export const AUDIT_USER_AGENT_MAX_LENGTH = 512;

function auditData(action: AuditAction, entry: AuditEntryInput): Prisma.AuditLogUncheckedCreateInput {
  return {
    action,
    ...(entry.actorId ? { userId: entry.actorId } : {}),
    ...(entry.actorEmail ? { userEmail: entry.actorEmail } : {}),
    ...(entry.bonId ? { bonId: entry.bonId } : {}),
    ...(entry.details !== undefined ? { details: entry.details } : {}),
    ...(entry.ip ? { ipAddress: entry.ip } : {}),
    ...(entry.userAgent ? { userAgent: entry.userAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH) } : {}),
  };
}

export async function writeAuditEntry(client: AuditWriter, action: AuditAction, entry: AuditEntryInput): Promise<void> {
  // Le type suffit à la compilation ; ce contrôle protège d'une action
  // construite à l'exécution (gabarit de chaîne, valeur lue ailleurs).
  if (!isAuditAction(action)) {
    throw new Error(`Action d'audit « ${String(action)} » absente du catalogue (contracts/audit-actions.ts)`);
  }
  await client.auditLog.create({ data: auditData(action, entry) });
}
