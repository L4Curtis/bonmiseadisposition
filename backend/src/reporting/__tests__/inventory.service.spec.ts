import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InventoryService, EXPORT_ROW_LIMIT } from '../inventory.service';
import { InventoryQueryDto } from '../dto/inventory-query.dto';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { PARC_BON_STATUSES, SITUATION_LABELS } from '../../common/bon-predicates';

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
    it('inclut exactement les 5 statuts « en circulation » (parc élargi) et exclut les équipements rendus/perdus', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({});

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ returnedAt: null });
      expect(call.where.AND).toContainEqual({ notReturned: false });
      // Définition élargie (audit 2026-09-18) : inclut désormais sent_mise_dispo
      // (matériel déjà remis, signature en attente) et contested (litige ouvert).
      expect(call.where.AND).toContainEqual({
        bon: { status: { in: [...PARC_BON_STATUSES] } },
      });
      expect(call.where.AND).toContainEqual({
        bon: {
          status: { in: ['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested'] },
        },
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

    it('ajoute le filtre situation quand fourni (restreint aux statuts de cette situation)', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({ situation: 'en_attente_signature' });
      let call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ bon: { status: { in: ['sent_mise_dispo'] } } });

      await service.getInventory({ situation: 'en_litige' });
      call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[1][0];
      expect(call.where.AND).toContainEqual({ bon: { status: { in: ['contested'] } } });
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
        situation: 'en_circulation',
        situationLabel: 'En circulation',
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

    it.each([
      ['sent_mise_dispo', 'en_attente_signature', 'En attente de signature'],
      ['active', 'en_circulation', 'En circulation'],
      ['sent_restitution', 'en_circulation', 'En circulation'],
      ['partially_returned', 'en_circulation', 'En circulation'],
      ['contested', 'en_litige', 'En litige'],
    ])('mappe le statut de bon %s vers la situation %s (%s)', async (bonStatus, situation, situationLabel) => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({ bon: { ...makeRow().bon, status: bonStatus } }),
      ]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getInventory({});

      expect(result.items[0].situation).toBe(situation);
      expect(result.items[0].situationLabel).toBe(situationLabel);
    });

    it('lève une erreur si une ligne porte un statut de bon hors du parc en circulation (invariant buildWhere)', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({ bon: { ...makeRow().bon, status: 'draft' } }),
      ]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(1);

      await expect(service.getInventory({})).rejects.toThrow(/hors du parc en circulation/);
    });
  });

  describe('getSummary', () => {
    it('agrège total, byCategory, byFiliale, bySituation et overdue via SQL', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ count: 5n }]) // total
        .mockResolvedValueOnce([
          { category: 'ecran', count: 3n },
          { category: 'pc_portable', count: 2n },
        ]) // byCategory
        .mockResolvedValueOnce([{ filialeId: 'f-1', name: 'Paris', count: 5n }]) // byFiliale
        .mockResolvedValueOnce([
          { situation: 'en_circulation', count: 4n },
          { situation: 'en_attente_signature', count: 1n },
        ]) // bySituation
        .mockResolvedValueOnce([{ count: 2n }]); // overdue

      const summary = await service.getSummary();

      expect(summary.total).toBe(5);
      expect(summary.byCategory).toEqual([
        { category: 'ecran', label: 'Écran', count: 3 },
        { category: 'pc_portable', label: 'PC portable', count: 2 },
      ]);
      expect(summary.byFiliale).toEqual([{ filialeId: 'f-1', name: 'Paris', count: 5 }]);
      expect(summary.bySituation).toEqual([
        { situation: 'en_attente_signature', label: 'En attente de signature', count: 1 },
        { situation: 'en_circulation', label: 'En circulation', count: 4 },
        { situation: 'en_litige', label: 'En litige', count: 0 },
      ]);
      // Invariant verrouillé par l'audit : la somme des situations égale le total.
      expect(summary.bySituation.reduce((sum, s) => sum + s.count, 0)).toBe(summary.total);
      expect(summary.overdue).toBe(2);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    });

    it('compare le statut enum via un cast ::text (sinon Postgres refuse « "BonStatus" = text »)', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 0n }]);

      await service.getSummary();

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      expect(calls).toHaveLength(5);
      for (const [query] of calls) {
        expect(query.sql).toContain('b.status::text IN (');
        expect(query.sql).not.toMatch(/b\.status IN \(/);
      }
    });

    it('utilise PARC_BON_STATUSES (5 statuts, définition élargie) dans chaque requête', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: 0n }]);

      await service.getSummary();

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      for (const [query] of calls) {
        for (const status of PARC_BON_STATUSES) {
          expect(query.values).toContain(status);
        }
      }
    });

    it('renvoie des agrégats à zéro (bySituation zéro-complété) quand le parc en circulation est vide', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }]);

      const summary = await service.getSummary();

      expect(summary).toEqual({
        total: 0,
        byCategory: [],
        byFiliale: [],
        bySituation: [
          { situation: 'en_attente_signature', label: SITUATION_LABELS.en_attente_signature, count: 0 },
          { situation: 'en_circulation', label: SITUATION_LABELS.en_circulation, count: 0 },
          { situation: 'en_litige', label: SITUATION_LABELS.en_litige, count: 0 },
        ],
        overdue: 0,
      });
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

    it('ajoute la colonne « Situation » avec le libellé FR de la situation', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({ bon: { ...makeRow().bon, status: 'sent_mise_dispo' } }),
      ]);

      const { csv } = await service.getExportCsv({});
      const [headerLine, dataLine] = csv.slice(1).split('\n');

      expect(headerLine).toContain('"Situation"');
      const situationColumnIndex = headerLine.split(';').indexOf('"Situation"');
      expect(dataLine.split(';')[situationColumnIndex]).toBe('"En attente de signature"');
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

  describe('InventoryQueryDto — filtre situation', () => {
    it.each(['en_attente_signature', 'en_circulation', 'en_litige'])(
      'accepte la situation valide « %s »',
      async (situation) => {
        const dto = plainToInstance(InventoryQueryDto, { situation });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it('rejette une situation inconnue', async () => {
      const dto = plainToInstance(InventoryQueryDto, { situation: 'perdu' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isIn');
    });

    it('est optionnelle (absente => aucune erreur)', async () => {
      const dto = plainToInstance(InventoryQueryDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
