/**
 * Verrou anti force brute de la connexion locale : où commence la fenêtre de
 * comptage des échecs d'un compte.
 *
 * Le verrou se déduit du journal (`login_local_failed`) : il n'existe aucun
 * état à effacer. Un déverrouillage par l'administrateur ne supprime donc
 * aucune ligne du journal ; il écrit une entrée `user_unlocked` (détails
 * `targetEmail`), qui sert de marqueur : seuls les échecs postérieurs au
 * dernier déverrouillage comptent encore.
 */
import type { Prisma } from '@prisma/client';

/** Durée de la fenêtre de comptage des échecs (30 minutes). */
export const LOGIN_LOCK_WINDOW_MS = 30 * 60 * 1000;

/** Ce que la fonction lit du journal (PrismaService ou une transaction). */
export interface LoginLockReader {
  readonly auditLog: {
    findFirst(args: {
      where: Prisma.AuditLogWhereInput;
      orderBy: Prisma.AuditLogOrderByWithRelationInput;
      select: { createdAt: true };
    }): Promise<{ createdAt: Date } | null>;
  };
}

/**
 * Début de la fenêtre où l'on compte les échecs de `email` : il y a 30
 * minutes, ou le dernier déverrouillage de ce compte s'il est plus récent.
 * `email` est l'adresse normalisée, telle que la connexion la trace.
 */
export async function lockWindowStart(reader: LoginLockReader, email: string, now: Date): Promise<Date> {
  const windowStart = new Date(now.getTime() - LOGIN_LOCK_WINDOW_MS);
  const lastUnlock = await reader.auditLog.findFirst({
    where: {
      action: 'user_unlocked',
      details: { path: ['targetEmail'], equals: email },
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return lastUnlock && lastUnlock.createdAt > windowStart ? lastUnlock.createdAt : windowStart;
}
