import { NotFoundException } from '@nestjs/common';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildSearchClauses, buildBonWhere, findBonOrThrow } from '../bon-where';
import { BonStatus } from '../../../common/types';

describe('buildSearchClauses', () => {
  it('returns the 4 OR clauses (reference, collaborateur name/email, serial number)', () => {
    const clauses = buildSearchClauses('BON-2026');

    expect(clauses).toHaveLength(4);
    expect(clauses).toEqual(
      expect.arrayContaining([
        { reference: { contains: 'BON-2026', mode: 'insensitive' } },
        { equipments: { some: { serialNumber: { contains: 'BON-2026', mode: 'insensitive' } } } },
      ]),
    );
  });
});

describe('buildBonWhere', () => {
  it('returns an empty where when no filter is set', () => {
    expect(buildBonWhere({})).toEqual({});
  });

  it('combines status and excludeStatus (AND, not override)', () => {
    const where = buildBonWhere({
      status: ['draft' as BonStatus, 'active' as BonStatus],
      excludeStatus: ['cancelled' as BonStatus],
    });

    expect(where.status).toEqual({ in: ['draft', 'active'], notIn: ['cancelled'] });
  });

  it('filters by filialeId', () => {
    expect(buildBonWhere({ filialeId: 'filiale-001' })).toEqual({ filialeId: 'filiale-001' });
  });

  it('sets the OR search clauses when search is provided', () => {
    const where = buildBonWhere({ search: 'SN-1234' });
    expect(where.OR).toHaveLength(4);
  });

  it('wraps buildOverdueSignatureWhere in AND when overdue is requested', () => {
    const where = buildBonWhere({ overdue: true }, 10) as {
      AND?: Array<{ updatedAt?: { lt: Date }; OR?: unknown[] }>;
    };

    expect(where.AND).toHaveLength(1);
    expect(where.AND?.[0].OR).toHaveLength(2);
    expect(where.AND?.[0].updatedAt?.lt).toBeInstanceOf(Date);
  });

  it('does not set AND when overdue is not requested', () => {
    expect(buildBonWhere({ overdue: false }).AND).toBeUndefined();
  });
});

describe('findBonOrThrow', () => {
  it('returns the bon when found', async () => {
    const prisma = createMockPrismaService();
    const bon = { id: 'bon-001', reference: 'BON-2026-0001' };
    prisma.bon.findUnique.mockResolvedValue(bon);

    const result = await findBonOrThrow(prisma as unknown as PrismaService, 'bon-001');

    expect(result).toEqual(bon);
    expect(prisma.bon.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bon-001' } }),
    );
  });

  it('throws NotFoundException when absent', async () => {
    const prisma = createMockPrismaService();
    prisma.bon.findUnique.mockResolvedValue(null);

    await expect(findBonOrThrow(prisma as unknown as PrismaService, 'missing-id')).rejects.toThrow(NotFoundException);
  });
});
