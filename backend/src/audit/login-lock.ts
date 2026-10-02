/**
 * Verrou anti force brute de la connexion locale, déduit du journal : il
 * n'existe aucun état à effacer.
 *
 * Deux verrous indépendants, sur la même fenêtre glissante de 30 minutes :
 *  - verrou du COMPTE : au moins ACCOUNT_LOCK_THRESHOLD échecs
 *    (`login_local_failed`) pour un même couple (adresse du compte, poste) ;
 *  - verrou du POSTE : au moins STATION_LOCK_THRESHOLD échecs depuis une même
 *    adresse IP, tous comptes confondus.
 *
 * Un déverrouillage par l'administrateur ne supprime aucune ligne du
 * journal ; il écrit une entrée `user_unlocked` (détails `targetEmail`), qui
 * sert de marqueur : seuls les échecs postérieurs au dernier déverrouillage
 * comptent encore pour le verrou du compte. Le verrou du poste, lui, n'en
 * tient pas compte : il tombe seul.
 *
 * La connexion (auth/local-login.ts) et l'écran Utilisateurs lisent ces
 * mêmes seuils et la même fenêtre : l'état affiché est celui que la
 * connexion applique.
 */
import type { Prisma } from '@prisma/client';

/** Durée de la fenêtre de comptage des échecs (30 minutes). */
export const LOGIN_LOCK_WINDOW_MS = 30 * 60 * 1000;

/** Échecs d'un même compte depuis un même poste qui verrouillent le compte. */
export const ACCOUNT_LOCK_THRESHOLD = 10;

/** Échecs depuis un même poste, tous comptes confondus, qui verrouillent le poste. */
export const STATION_LOCK_THRESHOLD = 30;

/** Échec de connexion tel que le journal le trace. */
export interface FailedLogin {
  readonly userEmail: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
}

/** Ce que les fonctions lisent du journal (PrismaService ou une transaction). */
export interface LoginLockReader {
  readonly auditLog: {
    findFirst(args: {
      where: Prisma.AuditLogWhereInput;
      orderBy: Prisma.AuditLogOrderByWithRelationInput;
      select: { createdAt: true };
    }): Promise<{ createdAt: Date } | null>;
  };
}

/** Lecture des échecs et des déverrouillages de plusieurs comptes à la fois. */
export interface LoginLockListReader {
  readonly auditLog: {
    findMany(args: {
      where: Prisma.AuditLogWhereInput;
      select: { userEmail: true; ipAddress: true; createdAt: true } | { details: true; createdAt: true };
    }): Promise<Array<Partial<FailedLogin> & { createdAt: Date; details?: Prisma.JsonValue }>>;
  };
}

/** État du verrou d'un compte. */
export interface AccountLockState {
  /** Échecs qui comptent encore (depuis le début de la fenêtre), tous postes. */
  readonly failures: readonly FailedLogin[];
  /** Fin du verrou du compte, `null` s'il n'est verrouillé depuis aucun poste. */
  readonly lockedUntil: Date | null;
}

function windowStartOf(now: Date): Date {
  return new Date(now.getTime() - LOGIN_LOCK_WINDOW_MS);
}

/** Début de la fenêtre d'un compte : il y a 30 minutes, ou son dernier
 *  déverrouillage s'il est plus récent. */
function accountWindowStart(lastUnlock: Date | null, now: Date): Date {
  const windowStart = windowStartOf(now);
  return lastUnlock && lastUnlock > windowStart ? lastUnlock : windowStart;
}

/**
 * Début de la fenêtre où l'on compte les échecs de `email` : il y a 30
 * minutes, ou le dernier déverrouillage de ce compte s'il est plus récent.
 * `email` est l'adresse normalisée, telle que la connexion la trace.
 */
export async function lockWindowStart(reader: LoginLockReader, email: string, now: Date): Promise<Date> {
  const lastUnlock = await reader.auditLog.findFirst({
    where: {
      action: 'user_unlocked',
      details: { path: ['targetEmail'], equals: email },
      createdAt: { gte: windowStartOf(now) },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return accountWindowStart(lastUnlock?.createdAt ?? null, now);
}

/**
 * Fin du verrou posé par ces échecs (tous déjà dans la fenêtre), ou `null`
 * s'ils sont moins de `threshold`. Le verrou tombe quand il ne reste plus que
 * `threshold - 1` échecs dans la fenêtre : 30 minutes après le
 * `threshold`-ième échec en partant du plus récent.
 */
export function lockExpiry(failures: readonly Date[], threshold: number): Date | null {
  if (failures.length < threshold) return null;
  const sorted = [...failures].sort((a, b) => a.getTime() - b.getTime());
  return new Date(sorted[sorted.length - threshold].getTime() + LOGIN_LOCK_WINDOW_MS);
}

function latest(dates: readonly (Date | null)[]): Date | null {
  return dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);
}

function groupByIp(failures: readonly FailedLogin[]): Date[][] {
  const groups = new Map<string, Date[]>();
  for (const f of failures) {
    const key = f.ipAddress ?? '';
    groups.set(key, [...(groups.get(key) ?? []), f.createdAt]);
  }
  return [...groups.values()];
}

/** Fin du verrou le plus tardif parmi les postes de ces échecs. */
function latestLockByIp(failures: readonly FailedLogin[], threshold: number): Date | null {
  return latest(groupByIp(failures).map((dates) => lockExpiry(dates, threshold)));
}

function targetEmailOf(details: Prisma.JsonValue | undefined): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const value = (details as Prisma.JsonObject).targetEmail;
  return typeof value === 'string' ? value : null;
}

/**
 * Verrou du compte de chaque adresse (normalisée), en deux lectures du
 * journal quel que soit le nombre de comptes. Même règle que la connexion :
 * un compte est verrouillé depuis un poste dès ACCOUNT_LOCK_THRESHOLD échecs
 * comptés depuis ce poste.
 */
export async function accountLockStates(
  reader: LoginLockListReader,
  emails: readonly string[],
  now: Date,
): Promise<ReadonlyMap<string, AccountLockState>> {
  if (emails.length === 0) return new Map();
  const since = windowStartOf(now);
  const [failures, unlocks] = await Promise.all([
    reader.auditLog.findMany({
      where: { action: 'login_local_failed', userEmail: { in: [...emails] }, createdAt: { gte: since } },
      select: { userEmail: true, ipAddress: true, createdAt: true },
    }),
    reader.auditLog.findMany({
      where: {
        action: 'user_unlocked',
        createdAt: { gte: since },
        OR: emails.map((email) => ({ details: { path: ['targetEmail'], equals: email } })),
      },
      select: { details: true, createdAt: true },
    }),
  ]);
  return new Map(emails.map((email) => {
    const lastUnlock = latest(unlocks.filter((u) => targetEmailOf(u.details) === email).map((u) => u.createdAt));
    const start = accountWindowStart(lastUnlock, now);
    const counted = failures
      .filter((f) => f.userEmail === email && f.createdAt >= start)
      .map((f): FailedLogin => ({ userEmail: email, ipAddress: f.ipAddress ?? null, createdAt: f.createdAt }));
    return [email, { failures: counted, lockedUntil: latestLockByIp(counted, ACCOUNT_LOCK_THRESHOLD) }];
  }));
}

/**
 * Fin du verrou de poste le plus tardif parmi `ips`, ou `null` si aucun de
 * ces postes n'est verrouillé. Un déverrouillage de compte n'y change rien.
 */
export async function stationLockedUntil(reader: LoginLockListReader, ips: readonly string[], now: Date): Promise<Date | null> {
  if (ips.length === 0) return null;
  const failures = await reader.auditLog.findMany({
    where: { action: 'login_local_failed', ipAddress: { in: [...ips] }, createdAt: { gte: windowStartOf(now) } },
    select: { userEmail: true, ipAddress: true, createdAt: true },
  });
  return latestLockByIp(
    failures.map((f) => ({ userEmail: f.userEmail ?? null, ipAddress: f.ipAddress ?? null, createdAt: f.createdAt })),
    STATION_LOCK_THRESHOLD,
  );
}
