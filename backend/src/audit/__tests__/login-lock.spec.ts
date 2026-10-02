import { describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_LOCK_THRESHOLD,
  LOGIN_LOCK_WINDOW_MS,
  accountLockStates,
  lockExpiry,
  lockWindowStart,
  stationLockedUntil,
} from '../login-lock';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const THIRTY_MINUTES_AGO = new Date(NOW.getTime() - LOGIN_LOCK_WINDOW_MS);

function prismaWithLastUnlock(createdAt: Date | null) {
  const findFirst = vi.fn().mockResolvedValue(createdAt ? { createdAt } : null);
  return { prisma: { auditLog: { findFirst } }, findFirst };
}

describe('lockWindowStart — début de la fenêtre du verrou par compte', () => {
  it('compte les échecs des 30 dernières minutes quand le compte n’a jamais été déverrouillé', async () => {
    const { prisma } = prismaWithLastUnlock(null);
    expect(await lockWindowStart(prisma, 'marie@livio.fr', NOW)).toEqual(THIRTY_MINUTES_AGO);
  });

  it('repart du déverrouillage quand il est plus récent que 30 minutes', async () => {
    const unlockedAt = new Date(NOW.getTime() - 5 * 60 * 1000);
    const { prisma } = prismaWithLastUnlock(unlockedAt);
    expect(await lockWindowStart(prisma, 'marie@livio.fr', NOW)).toEqual(unlockedAt);
  });

  it('ignore un déverrouillage plus ancien que la fenêtre', async () => {
    const { prisma } = prismaWithLastUnlock(new Date(NOW.getTime() - 2 * 60 * 60 * 1000));
    expect(await lockWindowStart(prisma, 'marie@livio.fr', NOW)).toEqual(THIRTY_MINUTES_AGO);
  });

  it('cherche le dernier `user_unlocked` visant cet email, dans la fenêtre seulement', async () => {
    const { prisma, findFirst } = prismaWithLastUnlock(null);
    await lockWindowStart(prisma, 'marie@livio.fr', NOW);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        action: 'user_unlocked',
        details: { path: ['targetEmail'], equals: 'marie@livio.fr' },
        createdAt: { gte: THIRTY_MINUTES_AGO },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
  });
});

const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60 * 1000);

describe('lockExpiry — fin d’un verrou', () => {
  it('pas de verrou sous le seuil', () => {
    expect(lockExpiry(Array.from({ length: ACCOUNT_LOCK_THRESHOLD - 1 }, (_, i) => minutesAgo(i)), ACCOUNT_LOCK_THRESHOLD)).toBeNull();
  });

  it('au seuil, le verrou tombe 30 minutes après le plus ancien échec qui compte', () => {
    const failures = Array.from({ length: ACCOUNT_LOCK_THRESHOLD }, (_, i) => minutesAgo(10 - i));
    expect(lockExpiry(failures, ACCOUNT_LOCK_THRESHOLD)).toEqual(new Date(minutesAgo(10).getTime() + LOGIN_LOCK_WINDOW_MS));
  });

  it('au-delà du seuil, il tombe quand il ne reste plus que seuil − 1 échecs (ordre indifférent)', () => {
    // 12 échecs, de 20 à 9 minutes : le verrou tient jusqu'à la sortie du 3e plus ancien (18 min).
    const failures = Array.from({ length: 12 }, (_, i) => minutesAgo(9 + i));
    expect(lockExpiry(failures, ACCOUNT_LOCK_THRESHOLD)).toEqual(new Date(minutesAgo(18).getTime() + LOGIN_LOCK_WINDOW_MS));
  });
});

/** Journal en mémoire : applique les filtres que la fonction envoie. */
function journal(rows: Array<{ action: string; userEmail?: string; ipAddress?: string; details?: object; createdAt: Date }>) {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where as {
      action: string;
      createdAt: { gte: Date };
      userEmail?: { in: string[] };
      ipAddress?: { in: string[] };
      OR?: Array<{ details: { equals: string } }>;
    };
    return rows
      .filter((r) => r.action === w.action && r.createdAt >= w.createdAt.gte)
      .filter((r) => !w.userEmail || w.userEmail.in.includes(r.userEmail ?? ''))
      .filter((r) => !w.ipAddress || w.ipAddress.in.includes(r.ipAddress ?? ''))
      .filter((r) => !w.OR || w.OR.some((o) => (r.details as { targetEmail?: string } | undefined)?.targetEmail === o.details.equals))
      .map((r) => ({ userEmail: r.userEmail ?? null, ipAddress: r.ipAddress ?? null, details: r.details ?? null, createdAt: r.createdAt }));
  });
  return { auditLog: { findMany } };
}

const failed = (email: string, ip: string, at: Date) => ({ action: 'login_local_failed', userEmail: email, ipAddress: ip, createdAt: at });

describe('accountLockStates — état affiché dans l’écran Utilisateurs', () => {
  it('verrouillé dès 10 échecs depuis un même poste, jusqu’à l’heure où la connexion le relâche', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => failed('marie@livio.fr', '10.0.0.1', minutesAgo(12 - i)));
    const states = await accountLockStates(journal(rows), ['marie@livio.fr'], NOW);
    expect(states.get('marie@livio.fr')?.lockedUntil).toEqual(new Date(minutesAgo(12).getTime() + LOGIN_LOCK_WINDOW_MS));
    expect(states.get('marie@livio.fr')?.failures).toHaveLength(10);
  });

  it('10 échecs répartis sur deux postes ne verrouillent pas (même règle que la connexion)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => failed('marie@livio.fr', i % 2 ? '10.0.0.1' : '10.0.0.2', minutesAgo(i + 1)));
    const states = await accountLockStates(journal(rows), ['marie@livio.fr'], NOW);
    expect(states.get('marie@livio.fr')?.lockedUntil).toBeNull();
  });

  it('les échecs d’avant le dernier déverrouillage ne comptent plus', async () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => failed('marie@livio.fr', '10.0.0.1', minutesAgo(20 - i))),
      { action: 'user_unlocked', details: { targetEmail: 'marie@livio.fr' }, createdAt: minutesAgo(5) },
      failed('marie@livio.fr', '10.0.0.1', minutesAgo(2)),
    ];
    const states = await accountLockStates(journal(rows), ['marie@livio.fr'], NOW);
    expect(states.get('marie@livio.fr')).toEqual({
      lockedUntil: null,
      failures: [{ userEmail: 'marie@livio.fr', ipAddress: '10.0.0.1', createdAt: minutesAgo(2) }],
    });
  });

  it('le déverrouillage d’un autre compte n’y change rien, et sans adresse rien n’est lu', async () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => failed('marie@livio.fr', '10.0.0.1', minutesAgo(20 - i))),
      { action: 'user_unlocked', details: { targetEmail: 'autre@livio.fr' }, createdAt: minutesAgo(5) },
    ];
    const reader = journal(rows);
    expect((await accountLockStates(reader, ['marie@livio.fr'], NOW)).get('marie@livio.fr')?.lockedUntil).not.toBeNull();
    reader.auditLog.findMany.mockClear();
    expect((await accountLockStates(reader, [], NOW)).size).toBe(0);
    expect(reader.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe('stationLockedUntil — verrou du poste, que le déverrouillage ne lève pas', () => {
  it('30 échecs depuis un poste, tous comptes confondus, le verrouillent malgré un déverrouillage', async () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => failed(`compte-${i % 6}@livio.fr`, '10.0.0.9', minutesAgo(25 - i * 0.5))),
      { action: 'user_unlocked', details: { targetEmail: 'compte-0@livio.fr' }, createdAt: minutesAgo(1) },
    ];
    expect(await stationLockedUntil(journal(rows), ['10.0.0.9'], NOW)).toEqual(new Date(minutesAgo(25).getTime() + LOGIN_LOCK_WINDOW_MS));
  });

  it('pas de verrou sous 30 échecs, ni sans poste à examiner', async () => {
    const rows = Array.from({ length: 29 }, (_, i) => failed('marie@livio.fr', '10.0.0.9', minutesAgo(i)));
    expect(await stationLockedUntil(journal(rows), ['10.0.0.9'], NOW)).toBeNull();
    expect(await stationLockedUntil(journal(rows), [], NOW)).toBeNull();
  });
});
