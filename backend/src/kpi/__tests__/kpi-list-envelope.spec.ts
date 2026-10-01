import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Mock } from 'vitest';
import { KpiListService } from '../lists/kpi-list.service';
import { KpiListQueryDto } from '../dto/kpi-list-query.dto';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

/**
 * `GET /kpi/liste` à la forme unique des listes (docs/api-conventions.md § 2) :
 * l'indicateur et la période passent dans `meta`.
 */
describe('GET /kpi/liste — enveloppe de liste', () => {
  it('renvoie { items, total, page, limit, truncated, meta: { indicateur, period } }', async () => {
    const prisma = createMockPrismaService();
    (prisma.$queryRaw as Mock)
      .mockResolvedValueOnce([{ count: 1n }])
      .mockResolvedValueOnce([{
        id: 'r1', bonId: 'b1', reference: 'BON-2026-0001', status: 'active',
        collaborateur: 'Jean Dupont', filiale: 'Paris', at: new Date('2026-09-10T08:00:00Z'), detail: null,
      }]);

    const result = await new KpiListService(prisma as never).getList({
      indicateur: 'bons_crees', from: '2026-09-01', to: '2026-09-30', page: 1, limit: 50,
    });

    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'r1', reference: 'BON-2026-0001' })],
      total: 1,
      page: 1,
      limit: 50,
      truncated: false,
      meta: { indicateur: 'bons_crees', period: { from: '2026-09-01', to: '2026-09-30' } },
    });
  });

  it('page 1 de 25 lignes par défaut', async () => {
    const prisma = createMockPrismaService();
    (prisma.$queryRaw as Mock).mockResolvedValueOnce([{ count: 0n }]).mockResolvedValueOnce([]);

    const result = await new KpiListService(prisma as never).getList({ indicateur: 'bons_crees' });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
  });

  it('le DTO accepte 25, 50, 100 et 200 lignes et refuse toute autre taille', async () => {
    for (const limit of ['25', '50', '100', '200']) {
      expect(await validate(plainToInstance(KpiListQueryDto, { indicateur: 'bons_crees', limit }))).toHaveLength(0);
    }
    for (const limit of ['3', '20', '500']) {
      const errors = await validate(plainToInstance(KpiListQueryDto, { indicateur: 'bons_crees', limit }));
      expect(errors.map((e) => e.property)).toContain('limit');
    }
  });
});
