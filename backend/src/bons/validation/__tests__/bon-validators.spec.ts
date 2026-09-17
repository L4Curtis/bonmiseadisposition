import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  assertFilialeUsable,
  assertCatalogItemsUsable,
  normalizeEquipmentInput,
  assertNoDuplicateSerials,
  assertSendable,
  findSerialConflicts,
} from '../bon-validators';

describe('normalizeEquipmentInput', () => {
  it('trims text fields and turns blanks into null', () => {
    const result = normalizeEquipmentInput(
      { customLabel: '  Souris sans fil  ', serialNumber: '  ', inventoryNumber: '' },
      0,
    );
    expect(result).toMatchObject({ customLabel: 'Souris sans fil', serialNumber: null, inventoryNumber: null });
  });

  it('defaults order to the index when not provided', () => {
    const result = normalizeEquipmentInput({}, 3);
    expect(result.order).toBe(3);
    expect(result.catalogItemId).toBeNull();
  });

  it('keeps the provided order over the index', () => {
    const result = normalizeEquipmentInput({ order: 7 }, 3);
    expect(result.order).toBe(7);
  });
});

describe('assertNoDuplicateSerials', () => {
  it('passes when serials are unique (ignoring null)', () => {
    expect(() =>
      assertNoDuplicateSerials([{ serialNumber: 'SN-001' }, { serialNumber: null }, { serialNumber: 'SN-002' }]),
    ).not.toThrow();
  });

  it('throws on a case-insensitive duplicate (trimmed upstream by normalizeEquipmentInput)', () => {
    expect(() =>
      assertNoDuplicateSerials([{ serialNumber: 'SN-DUP' }, { serialNumber: 'sn-dup' }]),
    ).toThrow(BadRequestException);
  });
});

describe('assertFilialeUsable', () => {
  it('passes when the filiale is active', async () => {
    const prisma = createMockPrismaService();
    prisma.filiale.findUnique.mockResolvedValue({ active: true });
    await expect(assertFilialeUsable(prisma as unknown as PrismaService, 'filiale-001')).resolves.toBeUndefined();
  });

  it('throws NotFoundException when the filiale is missing or inactive', async () => {
    const prisma = createMockPrismaService();
    prisma.filiale.findUnique.mockResolvedValue({ active: false });
    await expect(assertFilialeUsable(prisma as unknown as PrismaService, 'filiale-002')).rejects.toThrow(NotFoundException);

    prisma.filiale.findUnique.mockResolvedValue(null);
    await expect(assertFilialeUsable(prisma as unknown as PrismaService, 'filiale-003')).rejects.toThrow(NotFoundException);
  });
});

describe('assertCatalogItemsUsable', () => {
  it('passes for an empty list without querying', async () => {
    const prisma = createMockPrismaService();
    await expect(assertCatalogItemsUsable(prisma as unknown as PrismaService, [])).resolves.toBeUndefined();
    expect(prisma.equipmentCatalog.findMany).not.toHaveBeenCalled();
  });

  it('passes when every id is active', async () => {
    const prisma = createMockPrismaService();
    prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-001', active: true }]);
    await expect(assertCatalogItemsUsable(prisma as unknown as PrismaService, ['cat-001'])).resolves.toBeUndefined();
  });

  it('throws BadRequestException listing unknown/inactive ids', async () => {
    const prisma = createMockPrismaService();
    prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-001', active: false }]);
    await expect(assertCatalogItemsUsable(prisma as unknown as PrismaService, ['cat-001', 'cat-missing'])).rejects.toThrow(
      /cat-001, cat-missing/,
    );
  });
});

describe('assertSendable', () => {
  const baseBon = {
    collaborateurId: 'user-001',
    filiale: { active: true },
    equipments: [{ catalogItemId: 'cat-001', customLabel: null }],
  };

  it('passes for a well-formed sendable bon', async () => {
    const prisma = createMockPrismaService();
    prisma.user.findUnique.mockResolvedValue({ active: true });
    await expect(assertSendable(prisma as unknown as PrismaService, baseBon)).resolves.toBeUndefined();
  });

  it('throws when there is no equipment', async () => {
    const prisma = createMockPrismaService();
    await expect(assertSendable(prisma as unknown as PrismaService, { ...baseBon, equipments: [] })).rejects.toThrow(BadRequestException);
  });

  it('throws when an equipment has neither a catalog item nor a custom label', async () => {
    const prisma = createMockPrismaService();
    await expect(
      assertSendable(prisma as unknown as PrismaService, { ...baseBon, equipments: [{ catalogItemId: null, customLabel: '  ' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the filiale is inactive', async () => {
    const prisma = createMockPrismaService();
    await expect(assertSendable(prisma as unknown as PrismaService, { ...baseBon, filiale: { active: false } })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when the collaborateur is deactivated', async () => {
    const prisma = createMockPrismaService();
    prisma.user.findUnique.mockResolvedValue({ active: false });
    await expect(assertSendable(prisma as unknown as PrismaService, baseBon)).rejects.toThrow(BadRequestException);
  });
});

describe('findSerialConflicts', () => {
  it('returns [] without querying when there is no serial to check', async () => {
    const prisma = createMockPrismaService();
    const result = await findSerialConflicts(prisma as unknown as PrismaService, ['', '   '], 'bon-001');
    expect(result).toEqual([]);
    expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
  });

  it('maps conflicting equipment to { serialNumber, bonReference }', async () => {
    const prisma = createMockPrismaService();
    prisma.bonEquipment.findMany.mockResolvedValue([
      { serialNumber: 'SN-001', bon: { reference: 'BON-2026-0099' } },
    ]);

    const result = await findSerialConflicts(prisma as unknown as PrismaService, ['SN-001'], 'bon-current');

    expect(result).toEqual([{ serialNumber: 'SN-001', bonReference: 'BON-2026-0099' }]);
    expect(prisma.bonEquipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bon: expect.objectContaining({ id: { not: 'bon-current' } }),
        }),
      }),
    );
  });
});
