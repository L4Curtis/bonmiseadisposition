import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InventoryService, AGGREGATION_ROW_LIMIT } from '../inventory.service';
import { InventoryByCollaborateurQueryDto } from '../dto/inventory-by-collaborateur-query.dto';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { PARC_BON_STATUSES } from '../../common/bon-predicates';

function makeGroupRow(overrides: Record<string, unknown> = {}) {
  return {
    bon: {
      dateMiseDisposition: new Date('2026-01-10'),
      dateRestitution: new Date('2026-06-01'),
      collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT' },
      filiale: { id: 'f-1', displayName: 'Paris' },
      ...overrides,
    },
  };
}

describe('InventoryService.getInventoryByCollaborateur', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: InventoryService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new InventoryService(prisma as never);
  });

  it("réutilise le même where que getInventory (parc en circulation élargi + filtres)", async () => {
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);

    await service.getInventoryByCollaborateur({ filialeId: 'f-1', category: 'ecran', overdue: true }, new Date('2026-09-18'));

    const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.AND).toContainEqual({ returnedAt: null });
    expect(call.where.AND).toContainEqual({ notReturned: false });
    expect(call.where.AND).toContainEqual({ bon: { status: { in: [...PARC_BON_STATUSES] } } });
    expect(call.where.AND).toContainEqual({ bon: { filialeId: 'f-1' } });
    expect(call.where.AND).toContainEqual({ catalogItem: { category: 'ecran' } });
    expect(call.where.AND).toContainEqual({
      bon: { dateRestitution: { lt: new Date('2026-09-18T00:00:00.000Z') } },
    });
  });

  it('regroupe les lignes renvoyées par collaborateur et applique le tri "count" par défaut', async () => {
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow(),
      makeGroupRow(),
      makeGroupRow({ collaborateur: { id: 'u-2', displayName: 'Alice Martin', email: 'a@x.fr', department: 'RH' } }),
      makeGroupRow({ collaborateur: { id: 'u-2', displayName: 'Alice Martin', email: 'a@x.fr', department: 'RH' } }),
      makeGroupRow({ collaborateur: { id: 'u-2', displayName: 'Alice Martin', email: 'a@x.fr', department: 'RH' } }),
    ]);

    const result = await service.getInventoryByCollaborateur({});

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ collaborateurId: 'u-2', displayName: 'Alice Martin', count: 3 });
    expect(result.items[1]).toMatchObject({ collaborateurId: 'u-1', displayName: 'Jean Dupont', count: 2 });
  });

  it('applique le tri "oldest" (prêt le plus ancien en premier)', async () => {
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow({ dateMiseDisposition: new Date('2026-08-01'), collaborateur: { id: 'u-1', displayName: 'Récent', email: null, department: null } }),
      makeGroupRow({ dateMiseDisposition: new Date('2026-01-01'), collaborateur: { id: 'u-2', displayName: 'Ancien', email: null, department: null } }),
    ]);

    const result = await service.getInventoryByCollaborateur({ sort: 'oldest' });

    expect(result.items.map((i) => i.collaborateurId)).toEqual(['u-2', 'u-1']);
  });

  it('calcule overdueCount par collaborateur en fonction de `now`', async () => {
    const now = new Date('2026-09-18T10:00:00.000Z');
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
      makeGroupRow({ dateRestitution: new Date('2026-09-01T00:00:00.000Z') }), // en retard
      makeGroupRow({ dateRestitution: new Date('2026-12-01T00:00:00.000Z') }), // pas en retard
    ]);

    const result = await service.getInventoryByCollaborateur({}, now);

    expect(result.items[0]).toMatchObject({ count: 2, overdueCount: 1 });
  });

  it('pagine le résultat regroupé (pas les équipements) avec page=1/limit=50 par défaut', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeGroupRow({ collaborateur: { id: `u-${i}`, displayName: `Personne ${i}`, email: null, department: null } }),
    );
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await service.getInventoryByCollaborateur({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('plafonne limit à 200 et respecte page/limit fournis', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeGroupRow({ collaborateur: { id: `u-${i}`, displayName: `Personne ${i}`, email: null, department: null } }),
    );
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await service.getInventoryByCollaborateur({ page: 2, limit: 2 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.items).toHaveLength(2);

    const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(AGGREGATION_ROW_LIMIT + 1);
  });

  it('plafonne le nombre de lignes agrégées à AGGREGATION_ROW_LIMIT sans dupliquer la logique de filtrage', async () => {
    const rows = Array.from({ length: AGGREGATION_ROW_LIMIT + 1 }, (_, i) =>
      makeGroupRow({ collaborateur: { id: `u-${i}`, displayName: `Personne ${i}`, email: null, department: null } }),
    );
    (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await service.getInventoryByCollaborateur({ limit: 200 });

    // La dernière personne (au-delà du plafond) n'apparaît jamais dans le regroupement.
    expect(result.total).toBe(AGGREGATION_ROW_LIMIT);
  });
});

describe('InventoryByCollaborateurQueryDto', () => {
  it.each(['count', 'oldest'])('accepte le tri valide « %s »', async (sort) => {
    const dto = plainToInstance(InventoryByCollaborateurQueryDto, { sort });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejette un tri inconnu', async () => {
    const dto = plainToInstance(InventoryByCollaborateurQueryDto, { sort: 'nom' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('accepte les mêmes filtres que InventoryQueryDto (hors collaborateurId)', async () => {
    const dto = plainToInstance(InventoryByCollaborateurQueryDto, {
      filialeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      category: 'ecran',
      situation: 'en_circulation',
      overdue: '1',
      search: 'dell',
      page: 2,
      limit: 25,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.overdue).toBe(true);
  });

  it('est valide sans aucun paramètre (tout optionnel)', async () => {
    const dto = plainToInstance(InventoryByCollaborateurQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });
});
