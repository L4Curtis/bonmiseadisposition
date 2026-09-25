import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { useHostTimeZone } from '../../../common/__tests__/helpers/host-time-zone';
import { getBonStats } from '../bon-stats';

describe('getBonStats', () => {
  it('returns the dashboard shape and filters out filiales with 0 bons', async () => {
    const prisma = createMockPrismaService();
    prisma.bon.count
      .mockResolvedValueOnce(5) // waitingSignature
      .mockResolvedValueOnce(10) // active
      .mockResolvedValueOnce(2) // overdue
      .mockResolvedValueOnce(20) // total
      .mockResolvedValueOnce(3) // archivedThisMonth
      .mockResolvedValueOnce(4); // partiallyReturned
    prisma.filiale.findMany.mockResolvedValue([
      { id: 'filiale-001', displayName: 'Filiale Demo', _count: { bons: 8 } },
      { id: 'filiale-002', displayName: 'Filiale Vide', _count: { bons: 0 } },
    ]);

    const stats = await getBonStats(prisma as unknown as PrismaService, 7);

    expect(stats).toEqual({
      waitingSignature: 5,
      active: 10,
      overdue: 2,
      total: 20,
      archivedThisMonth: 3,
      partiallyReturned: 4,
      overdueThresholdDays: 7,
      byFiliale: [{ id: 'filiale-001', name: 'Filiale Demo', count: 8 }],
    });
  });

  it('uses the given overdueThresholdDays to build the overdue count where clause', async () => {
    const prisma = createMockPrismaService();
    prisma.bon.count.mockResolvedValue(0);
    prisma.filiale.findMany.mockResolvedValue([]);

    await getBonStats(prisma as unknown as PrismaService, 10);

    const overdueCountCall = prisma.bon.count.mock.calls.find(
      (call) => (call[0] as { where?: { AND?: unknown[] } })?.where?.AND !== undefined,
    ) as [{ where: { AND: Array<{ updatedAt: { lt: Date } }> } }] | undefined;
    expect(overdueCountCall).toBeDefined();
    expect(overdueCountCall?.[0].where.AND[0].updatedAt.lt).toBeInstanceOf(Date);
  });

  /** Borne basse du compteur « clôturés ce mois-ci » pour une horloge figée. */
  async function archivedThisMonthStart(now: string): Promise<string | undefined> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    try {
      const prisma = createMockPrismaService();
      prisma.bon.count.mockResolvedValue(0);
      prisma.filiale.findMany.mockResolvedValue([]);

      await getBonStats(prisma as unknown as PrismaService, 7);

      const archivedThisMonthCall = prisma.bon.count.mock.calls.find(
        (call) => (call[0] as { where?: { status?: string } })?.where?.status === 'archived',
      ) as [{ where: { archivedAt: { gte: Date } } }] | undefined;
      return archivedThisMonthCall?.[0].where.archivedAt.gte.toISOString();
    } finally {
      vi.useRealTimers();
    }
  }

  describe('« clôturés ce mois-ci » compte depuis le 1er du mois à Paris', () => {
    useHostTimeZone('UTC');

    it.each([
      ['1er mars, 0 h 30 à Paris (hiver)', '2026-02-28T23:30:00.000Z', '2026-02-28T23:00:00.000Z'],
      ['1er août, 0 h 30 à Paris (été)', '2026-07-31T22:30:00.000Z', '2026-07-31T22:00:00.000Z'],
      ['1er août, 1 h 59 à Paris (été)', '2026-07-31T23:59:00.000Z', '2026-07-31T22:00:00.000Z'],
      ['1er mars, 1 h 30 à Paris (hiver)', '2026-03-01T00:30:00.000Z', '2026-02-28T23:00:00.000Z'],
      ['31 juillet, 23 h à Paris : encore juillet', '2026-07-31T21:00:00.000Z', '2026-06-30T22:00:00.000Z'],
    ])('%s', async (_label, now, expected) => {
      expect(await archivedThisMonthStart(now)).toBe(expected);
    });
  });
});
