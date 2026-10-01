import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Mock } from 'vitest';
import { InventoryService, EXPORT_ROW_LIMIT } from '../inventory.service';
import { inventoryExportRowLimit, INVENTORY_EXPORT_LIMIT_ENV } from '../inventory-export-limit';
import { InventoryQueryDto } from '../dto/inventory-query.dto';
import { InventoryByCollaborateurQueryDto } from '../dto/inventory-by-collaborateur-query.dto';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

/**
 * Inventaire à la forme unique des listes (docs/api-conventions.md § 2) :
 * `{ items, total, page, limit, truncated, meta }`, pagination par le DTO
 * commun (25, 50, 100 ou 200 lignes), et deux noms distincts pour le
 * « Retour en retard » (`overdueReturns`), l'ancien `overdue` restant servi
 * pendant la vague 3.
 */

function makeRow(id: string, dateRestitution: Date | null = new Date('2026-06-01')) {
  return {
    id,
    customLabel: null,
    serialNumber: `SN-${id}`,
    inventoryNumber: null,
    notReturned: false,
    notReturnedReason: null,
    catalogItem: { category: 'ecran', brand: 'LG', model: '27' },
    bon: {
      id: `b-${id}`,
      reference: `BON-2026-${id}`,
      status: 'active',
      dateMiseDisposition: new Date('2026-01-10'),
      dateRestitution,
      collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j@x.fr', department: null, active: true },
      filiale: { id: 'f-1', name: 'paris', displayName: 'Paris' },
    },
  };
}

describe('Inventaire — enveloppe de liste', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: InventoryService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new InventoryService(prisma as never);
  });

  it('GET /reporting/inventory : forme unique, avec le plafond d’export dans `meta`', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeRow('1')]);
    (prisma.bonEquipment.count as Mock).mockResolvedValue(51);

    const result = await service.getInventory({ page: 2, limit: 50 });

    expect(result).toMatchObject({ total: 51, page: 2, limit: 50, truncated: false, meta: { exportLimit: EXPORT_ROW_LIMIT } });
    expect(result.items).toHaveLength(1);
    const call = (prisma.bonEquipment.findMany as Mock).mock.calls[0][0];
    expect(call).toMatchObject({ skip: 50, take: 50 });
  });

  it('page 1 de 25 lignes par défaut (taille commune à toutes les listes)', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([]);
    (prisma.bonEquipment.count as Mock).mockResolvedValue(0);

    const result = await service.getInventory({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
  });

  it('by-collaborateur : forme unique, « Retour en retard » nommé `overdueReturns`', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeRow('1'), makeRow('2', null)]);

    const result = await service.getInventoryByCollaborateur({}, new Date('2026-09-01T10:00:00Z'));

    expect(result).toMatchObject({ total: 1, page: 1, limit: 25, truncated: false });
    expect(result.items[0]).toMatchObject({ count: 2, overdueReturns: 1, overdueCount: 1 });
  });

  it('résumé : `overdueReturns`, et l’ancien `overdue` à l’identique pendant la vague', async () => {
    (prisma.$queryRaw as Mock)
      .mockResolvedValueOnce([{ count: 4n }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 3n }])
      .mockResolvedValueOnce([{ count: 0n }]);

    const summary = await service.getSummary();

    expect(summary.overdueReturns).toBe(3);
    expect(summary.overdue).toBe(3);
  });
});

describe('Inventaire — pagination par le DTO commun', () => {
  const parse = (limit: string): object[] => [
    plainToInstance(InventoryQueryDto, { limit }),
    plainToInstance(InventoryByCollaborateurQueryDto, { limit }),
  ];

  it('liste et regroupement : 25, 50, 100 et 200 lignes acceptées', async () => {
    for (const dto of ['25', '50', '100', '200'].flatMap(parse)) {
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('liste et regroupement : une autre taille est refusée, jamais corrigée', async () => {
    for (const dto of ['1', '20', '500'].flatMap(parse)) {
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toContain('limit');
    }
  });

  it('page 1 et 25 lignes quand rien n’est demandé', () => {
    const dto = plainToInstance(InventoryQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(25);
  });
});

describe('Inventaire — plafond de l’export', () => {
  it('10 000 lignes par défaut', () => {
    expect(inventoryExportRowLimit({})).toBe(EXPORT_ROW_LIMIT);
    expect(EXPORT_ROW_LIMIT).toBe(10000);
  });

  it('abaissé par la variable d’environnement (recette, tests)', () => {
    expect(inventoryExportRowLimit({ [INVENTORY_EXPORT_LIMIT_ENV]: '3' })).toBe(3);
  });

  it.each(['0', '-5', 'abc', '2.5', '20000', ''])('valeur « %s » ignorée : on ne relève jamais le plafond', (value) => {
    expect(inventoryExportRowLimit({ [INVENTORY_EXPORT_LIMIT_ENV]: value })).toBe(EXPORT_ROW_LIMIT);
  });

  it('l’export suit le plafond appliqué et signale la coupure', async () => {
    const prisma = createMockPrismaService();
    const service = new InventoryService(prisma as never);
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeRow('1'), makeRow('2'), makeRow('3')]);

    const { csv, truncated } = await service.getExportCsv({}, new Date('2026-09-01T10:00:00Z'), 2);

    expect(truncated).toBe(true);
    expect(csv.split('\n')).toHaveLength(3);
    expect((prisma.bonEquipment.findMany as Mock).mock.calls[0][0]).toMatchObject({ take: 3 });
  });
});
