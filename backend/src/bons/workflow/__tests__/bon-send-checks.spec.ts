import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrismaService, type MockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import {
  assertSendChecksConfirmed,
  auditConfirmedChecks,
  CheckedBon,
  computeSendChecks,
  findMissingSerialLines,
} from '../bon-send-checks';

function equipment(overrides: Partial<CheckedBon['equipments'][number]> & { id: string }) {
  return {
    order: 0,
    serialNumber: null,
    inventoryNumber: null,
    customLabel: null,
    catalogItem: null,
    ...overrides,
  };
}

const LAPTOP = equipment({
  id: 'eq-1',
  serialNumber: 'SN-001',
  catalogItem: { brand: 'Lenovo', model: 'ThinkBook 16' },
});
const UNIDENTIFIED_SCREEN = equipment({
  id: 'eq-2',
  serialNumber: '  ',
  catalogItem: { brand: 'Dell', model: 'P2425' },
});
const TAGGED_MOUSE = equipment({ id: 'eq-3', inventoryNumber: 'INV-42', customLabel: 'Souris' });
const UNLABELLED = equipment({ id: 'eq-4' });

/** Ligne telle que la renvoie la recherche de conflits (include `bon`). */
function conflictRow(serialNumber: string, reference: string) {
  return {
    serialNumber,
    bon: { id: `id-${reference}`, reference, status: 'active', collaborateur: { displayName: 'Léa Martin' } },
  };
}

function asPrisma(prisma: MockPrismaService): PrismaService {
  return prisma as unknown as PrismaService;
}

describe('lignes sans numéro identifiant', () => {
  it('liste, dans l’ordre du bon, les lignes sans numéro de série ni d’inventaire', () => {
    const bon: CheckedBon = { id: 'bon-1', equipments: [LAPTOP, UNIDENTIFIED_SCREEN, TAGGED_MOUSE, UNLABELLED] };
    expect(findMissingSerialLines(bon)).toEqual([
      { equipmentId: 'eq-2', position: 2, label: 'Dell P2425' },
      { equipmentId: 'eq-4', position: 4, label: 'Équipement' },
    ]);
  });
});

describe('contrôles avant la remise', () => {
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    prisma.bonEquipment.findMany.mockResolvedValue([]);
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('cherche les numéros de série du bon en circulation ailleurs, hors ce bon', async () => {
    prisma.bonEquipment.findMany.mockResolvedValue([conflictRow('SN-001', 'BON-2026-0007')]);
    const checks = await computeSendChecks(asPrisma(prisma), { id: 'bon-1', equipments: [LAPTOP, TAGGED_MOUSE] });

    expect(checks).toEqual({ missingSerials: [], serialConflicts: [{ serialNumber: 'SN-001', bonReference: 'BON-2026-0007' }] });
    const where = prisma.bonEquipment.findMany.mock.calls[0][0].where;
    expect(where.serialNumber.in).toEqual(['SN-001']);
    expect(where.bon.id).toEqual({ notIn: ['bon-1'] });
  });

  it('ignore le bon remplacé : ses équipements sont les mêmes, par nature', async () => {
    prisma.bonEquipment.findMany.mockResolvedValue([
      conflictRow('SN-001', 'BON-2026-0003'),
      conflictRow('SN-001', 'BON-2026-0009'),
    ]);
    const bon: CheckedBon = { id: 'bon-1', equipments: [LAPTOP], replacesBon: { reference: 'BON-2026-0003' } };

    const { serialConflicts } = await computeSendChecks(asPrisma(prisma), bon);
    expect(serialConflicts).toEqual([{ serialNumber: 'SN-001', bonReference: 'BON-2026-0009' }]);
  });

  it('sans aucun numéro de série, n’interroge pas la base', async () => {
    const checks = await computeSendChecks(asPrisma(prisma), { id: 'bon-1', equipments: [TAGGED_MOUSE] });
    expect(checks).toEqual({ missingSerials: [], serialConflicts: [] });
    expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
  });

  it('refuse (409) une ligne sans numéro tant que l’IT ne l’a pas confirmée', async () => {
    const bon: CheckedBon = { id: 'bon-1', equipments: [UNLABELLED] };
    const refusal = await assertSendChecksConfirmed(asPrisma(prisma), bon, {}).catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(ConflictException);
    expect((refusal as ConflictException).getResponse()).toEqual({
      code: 'missing_serials',
      lines: [{ equipmentId: 'eq-4', position: 1, label: 'Équipement' }],
    });
    await expect(assertSendChecksConfirmed(asPrisma(prisma), bon, { confirmMissingSerials: true }))
      .resolves.toMatchObject({ missingSerials: [{ equipmentId: 'eq-4' }] });
  });

  it('refuse (409) un numéro déjà en circulation tant que l’IT ne l’a pas confirmé', async () => {
    prisma.bonEquipment.findMany.mockResolvedValue([conflictRow('SN-001', 'BON-2026-0007')]);
    const bon: CheckedBon = { id: 'bon-1', equipments: [LAPTOP] };
    const refusal = await assertSendChecksConfirmed(asPrisma(prisma), bon, { confirmMissingSerials: true })
      .catch((err: unknown) => err);

    expect((refusal as ConflictException).getResponse()).toEqual({
      code: 'serial_conflicts',
      conflicts: [{ serialNumber: 'SN-001', bonReference: 'BON-2026-0007' }],
    });
    await expect(assertSendChecksConfirmed(asPrisma(prisma), bon, { confirmSerialConflicts: true })).resolves.toBeDefined();
  });

  it('trace dans l’audit chaque contrôle passé outre, et rien quand tout est en ordre', async () => {
    await auditConfirmedChecks(asPrisma(prisma), 'bon-1', 'user-it', { missingSerials: [], serialConflicts: [] });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();

    await auditConfirmedChecks(asPrisma(prisma), 'bon-1', 'user-it', {
      missingSerials: [{ equipmentId: 'eq-4', position: 1, label: 'Équipement' }],
      serialConflicts: [{ serialNumber: 'SN-001', bonReference: 'BON-2026-0007' }],
    });
    expect(prisma.auditLog.create.mock.calls.map(([arg]) => arg.data)).toEqual([
      {
        bonId: 'bon-1',
        userId: 'user-it',
        action: 'bon_sent_without_serial',
        details: { lines: [{ position: 1, label: 'Équipement' }] },
      },
      {
        bonId: 'bon-1',
        userId: 'user-it',
        action: 'bon_sent_with_serial_conflicts',
        details: { conflicts: [{ serialNumber: 'SN-001', bonReference: 'BON-2026-0007' }] },
      },
    ]);
  });
});
