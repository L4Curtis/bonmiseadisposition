import { describe, expect, it, vi } from 'vitest';
import { LOGIN_LOCK_WINDOW_MS, lockWindowStart } from '../login-lock';

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
