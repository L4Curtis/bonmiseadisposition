import { InventoryService, EXPORT_ROW_LIMIT, escapeCsvCell } from '../inventory.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'be-1',
    customLabel: null,
    serialNumber: 'SN-1',
    inventoryNumber: 'INV-1',
    catalogItem: { category: 'ecran', brand: 'LG', model: '27"' },
    bon: {
      id: 'b-1',
      reference: 'BON-2026-0001',
      status: 'active',
      dateMiseDisposition: new Date('2026-01-10'),
      dateRestitution: new Date('2026-06-01'),
      collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT' },
      filiale: { id: 'f-1', name: 'paris', displayName: 'Paris' },
    },
    ...overrides,
  };
}

describe('InventoryService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: InventoryService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new InventoryService(prisma as never);
  });

  describe('getInventory — where', () => {
    it('inclut exactement les 3 statuts « prêté » et exclut les équipements rendus/perdus', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({});

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ returnedAt: null });
      expect(call.where.AND).toContainEqual({ notReturned: false });
      expect(call.where.AND).toContainEqual({
        bon: { status: { in: ['active', 'sent_restitution', 'partially_returned'] } },
      });
      // Exactement 3 clauses (returnedAt, notReturned, statuts) sans filtre
      // optionnel supplémentaire quand aucun n'est fourni.
      expect(call.where.AND).toHaveLength(3);
      // Le même where doit être utilisé pour le count (cohérence total/pagination)
      const countCall = (prisma.bonEquipment.count as jest.Mock).mock.calls[0][0];
      expect(countCall.where).toEqual(call.where);
    });

    it('ajoute le filtre filiale/collaborateur/catégorie/recherche quand fournis', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({
        filialeId: 'f-1',
        collaborateurId: 'u-1',
        category: 'ecran',
        search: 'dell',
      });

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ bon: { filialeId: 'f-1' } });
      expect(call.where.AND).toContainEqual({ bon: { collaborateurId: 'u-1' } });
      expect(call.where.AND).toContainEqual({ catalogItem: { category: 'ecran' } });
      const searchClause = call.where.AND.find((c: { OR?: unknown[] }) => Array.isArray(c.OR) && c.OR.length === 6);
      expect(searchClause).toBeDefined();
    });

    it('catégorie "autre" couvre à la fois les équipements sans fiche catalogue et category=autre', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({ category: 'autre' as never });

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({
        OR: [{ catalogItemId: null }, { catalogItem: { category: 'autre' } }],
      });
    });
  });

  describe('getInventory — pagination et mapping', () => {
    it('applique page=1/limit=50 par défaut', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getInventory({});

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(50);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('calcule skip à partir de page/limit et plafonne limit à 200', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({ page: 3, limit: 20 });
      let call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(40);
      expect(call.take).toBe(20);

      await service.getInventory({ page: 1, limit: 9999 as never });
      call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[1][0];
      expect(call.take).toBe(200);
    });

    it('mappe chaque ligne vers la forme attendue par le frontend', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([makeRow()]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getInventory({});

      expect(result.items[0]).toMatchObject({
        equipmentId: 'be-1',
        label: 'LG 27"',
        category: 'ecran',
        serialNumber: 'SN-1',
        inventoryNumber: 'INV-1',
        bonId: 'b-1',
        bonReference: 'BON-2026-0001',
        bonStatus: 'active',
        collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT' },
        filiale: { id: 'f-1', name: 'paris', displayName: 'Paris' },
      });
    });

    it('utilise le customLabel quand il n’y a pas de fiche catalogue', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({ catalogItem: null, customLabel: 'Adaptateur USB-C' }),
      ]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getInventory({});

      expect(result.items[0].label).toBe('Adaptateur USB-C');
      expect(result.items[0].category).toBe('autre');
    });
  });

  describe('getSummary', () => {
    it('agrège total, byCategory, byFiliale et overdue via SQL', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ count: 5n }]) // total
        .mockResolvedValueOnce([
          { category: 'ecran', count: 3n },
          { category: 'pc_portable', count: 2n },
        ]) // byCategory
        .mockResolvedValueOnce([{ filialeId: 'f-1', name: 'Paris', count: 5n }]) // byFiliale
        .mockResolvedValueOnce([{ count: 2n }]); // overdue

      const summary = await service.getSummary();

      expect(summary.total).toBe(5);
      expect(summary.byCategory).toEqual([
        { category: 'ecran', label: 'Écran', count: 3 },
        { category: 'pc_portable', label: 'PC portable', count: 2 },
      ]);
      expect(summary.byFiliale).toEqual([{ filialeId: 'f-1', name: 'Paris', count: 5 }]);
      expect(summary.overdue).toBe(2);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('renvoie des agrégats à zéro quand le parc prêté est vide', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }]);

      const summary = await service.getSummary();

      expect(summary).toEqual({ total: 0, byCategory: [], byFiliale: [], overdue: 0 });
    });
  });

  describe('getExportCsv', () => {
    it('produit un CSV préfixé BOM avec en-têtes et échappe les cellules', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({ customLabel: null, catalogItem: { category: 'ecran', brand: 'LG', model: '27"' } }),
      ]);

      const { csv, truncated } = await service.getExportCsv({});

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('Équipement');
      expect(csv).toContain('BON-2026-0001');
      expect(csv).toContain('SN-1');
      expect(truncated).toBe(false);
    });

    it('plafonne à EXPORT_ROW_LIMIT lignes et signale la troncature', async () => {
      const rows = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, i) =>
        makeRow({ id: `be-${i}`, bon: { ...makeRow().bon, id: `b-${i}`, reference: `BON-2026-${i}` } }),
      );
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue(rows);

      const { csv, truncated } = await service.getExportCsv({});

      expect(truncated).toBe(true);
      // en-têtes + EXPORT_ROW_LIMIT lignes de données, pas une de plus
      expect(csv.split('\n')).toHaveLength(EXPORT_ROW_LIMIT + 1);
    });
  });
});

describe('escapeCsvCell — anti-injection de formule (Excel/LibreOffice)', () => {
  it.each([
    ['=', '=SOMME(A1)'],
    ['+', '+1234567'],
    ['-', '-1234567'],
    ['@', '@cmd|/c calc'],
    ['tabulation', '\tcmd'],
    ['retour chariot', '\rcmd'],
  ])('préfixe d’une apostrophe une cellule commençant par « %s »', (_label, value) => {
    expect(escapeCsvCell(value)).toBe(`"'${value}"`);
  });

  it('n’altère pas une cellule sans caractère déclencheur de formule', () => {
    expect(escapeCsvCell('Dell')).toBe('"Dell"');
  });

  it('double les guillemets internes', () => {
    expect(escapeCsvCell('12" écran')).toBe('"12"" écran"');
  });
});
