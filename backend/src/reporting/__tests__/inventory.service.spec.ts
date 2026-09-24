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

    it('ajoute le filtre "overdue" (retard de restitution), indépendant de la situation', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);
      const now = new Date('2026-09-18T10:00:00.000Z');

      await service.getInventory({ overdue: true }, now);

      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.AND).toContainEqual({
        bon: { dateRestitution: { lt: new Date('2026-09-18T00:00:00.000Z') } },
      });
    });

    it('ajoute le filtre « sans numéro de série » (NULL ou vide) à la liste et à l’export', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({ sansNumeroSerie: true });
      const clause = { OR: [{ serialNumber: null }, { serialNumber: '' }] };
      expect((prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0].where.AND).toContainEqual(clause);

      await service.getExportCsv({ sansNumeroSerie: true });
      expect((prisma.bonEquipment.findMany as jest.Mock).mock.calls.at(-1)[0].where.AND).toContainEqual(clause);
    });

    it('n’ajoute aucun filtre « sans numéro de série » quand il est absent ou faux', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({ sansNumeroSerie: false });
      expect((prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0].where.AND).toHaveLength(3);
    });

    it('n\'ajoute aucun filtre "overdue" quand il est absent ou faux', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);

      await service.getInventory({});
      const call = (prisma.bonEquipment.findMany as jest.Mock).mock.calls[0][0];
      // Exactement 3 clauses (returnedAt, notReturned, statuts) — aucun filtre
      // dateRestitution ajouté.
      expect(call.where.AND).toHaveLength(3);
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

  describe('getInventory — tri (sort/direction)', () => {
    async function orderByOf(query: Parameters<InventoryService['getInventory']>[0]) {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bonEquipment.count as jest.Mock).mockResolvedValue(0);
      await service.getInventory(query);
      return (prisma.bonEquipment.findMany as jest.Mock).mock.calls.at(-1)[0].orderBy;
    }

    const TIE_BREAKERS = [{ bon: { dateMiseDisposition: 'desc' } }, { id: 'asc' }];

    it('trie par dateMiseDisposition décroissant par défaut, départagé par l’identifiant (tri stable)', async () => {
      expect(await orderByOf({})).toEqual([{ bon: { dateMiseDisposition: 'desc' } }, { id: 'asc' }]);
    });

    it('applique "direction" au champ dateMiseDisposition explicitement choisi', async () => {
      expect(await orderByOf({ sort: 'dateMiseDisposition', direction: 'asc' })).toEqual([
        { bon: { dateMiseDisposition: 'asc' } },
        { id: 'asc' },
      ]);
    });

    it.each([
      ['collaborateur', [{ bon: { collaborateur: { displayName: 'asc' } } }]],
      ['category', [{ catalogItem: { category: 'asc' } }]],
      ['filiale', [{ bon: { filiale: { displayName: 'asc' } } }]],
      ['serialNumber', [{ serialNumber: { sort: 'asc', nulls: 'last' } }]],
      ['dateRestitution', [{ bon: { dateRestitution: { sort: 'asc', nulls: 'last' } } }]],
      [
        'label',
        [
          { catalogItem: { brand: 'asc' } },
          { catalogItem: { model: 'asc' } },
          { customLabel: { sort: 'asc', nulls: 'last' } },
        ],
      ],
    ] as const)('trie par « %s » (croissant par défaut) puis départage de façon stable', async (sort, primary) => {
      expect(await orderByOf({ sort })).toEqual([...primary, ...TIE_BREAKERS]);
    });

    it('applique "direction" à chaque champ, valeurs absentes toujours en fin de liste', async () => {
      expect(await orderByOf({ sort: 'collaborateur', direction: 'desc' })).toEqual([
        { bon: { collaborateur: { displayName: 'desc' } } },
        ...TIE_BREAKERS,
      ]);
      expect(await orderByOf({ sort: 'serialNumber', direction: 'desc' })).toEqual([
        { serialNumber: { sort: 'desc', nulls: 'last' } },
        ...TIE_BREAKERS,
      ]);
      expect(await orderByOf({ sort: 'dateRestitution', direction: 'desc' })).toEqual([
        { bon: { dateRestitution: { sort: 'desc', nulls: 'last' } } },
        ...TIE_BREAKERS,
      ]);
    });

    describe('tri par situation (ordre métier, pas l’ordre physique de l’enum en base)', () => {
      function whereStatuses(call: { where: { AND: [unknown, { bon: { status: { in: string[] } } }] } }) {
        return call.where.AND[1].bon.status.in;
      }

      it('compte chaque situation puis ne lit que les tranches qui recoupent la page', async () => {
        // Tranches : attente [0, 2[, circulation [2, 5[, litige [5, 9[. La page 2
        // de 3 lignes (lignes 3 à 5) = circulation[1..2] + litige[0].
        (prisma.bonEquipment.count as jest.Mock)
          .mockResolvedValueOnce(2) // en_attente_signature
          .mockResolvedValueOnce(3) // en_circulation
          .mockResolvedValueOnce(4) // en_litige
          .mockResolvedValueOnce(9); // total de la liste
        (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);

        await service.getInventory({ sort: 'situation', page: 2, limit: 3 });

        const calls = (prisma.bonEquipment.findMany as jest.Mock).mock.calls.map((c) => c[0]);
        expect(calls).toHaveLength(2);
        expect(whereStatuses(calls[0])).toEqual(['active', 'sent_restitution', 'partially_returned']);
        expect(calls[0]).toMatchObject({ skip: 1, take: 2, orderBy: TIE_BREAKERS });
        expect(whereStatuses(calls[1])).toEqual(['contested']);
        expect(calls[1]).toMatchObject({ skip: 0, take: 1, orderBy: TIE_BREAKERS });
      });

      it('parcourt les situations dans l’ordre inverse en décroissant (export compris)', async () => {
        (prisma.bonEquipment.count as jest.Mock)
          .mockResolvedValueOnce(1) // en_litige
          .mockResolvedValueOnce(0) // en_circulation
          .mockResolvedValueOnce(2); // en_attente_signature
        (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);

        await service.getExportCsv({ sort: 'situation', direction: 'desc' });

        const calls = (prisma.bonEquipment.findMany as jest.Mock).mock.calls.map((c) => c[0]);
        expect(calls.map(whereStatuses)).toEqual([['contested'], ['sent_mise_dispo']]);
        expect(calls[1]).toMatchObject({ skip: 0, take: 2 });
      });
    });

    it('applique le même tri à l’export CSV qu’à la liste', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      await service.getExportCsv({ sort: 'filiale', direction: 'desc' });
      expect((prisma.bonEquipment.findMany as jest.Mock).mock.calls.at(-1)[0].orderBy).toEqual([
        { bon: { filiale: { displayName: 'desc' } } },
        ...TIE_BREAKERS,
      ]);
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

    it('ajoute les colonnes « Ancienneté (jours) » et « Retard (jours) », calculées depuis `now`', async () => {
      const now = new Date('2026-09-18T10:00:00.000Z');
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          bon: {
            ...makeRow().bon,
            dateMiseDisposition: new Date('2026-09-01T00:00:00.000Z'), // 17 j avant `now`
            dateRestitution: new Date('2026-09-10T00:00:00.000Z'), // 8 j de retard
          },
        }),
      ]);

      const { csv } = await service.getExportCsv({}, now);
      const [headerLine, dataLine] = csv.slice(1).split('\n');
      const cols = headerLine.split(';');

      expect(cols).toContain('"Ancienneté (jours)"');
      expect(cols).toContain('"Retard (jours)"');
      const values = dataLine.split(';');
      expect(values[cols.indexOf('"Ancienneté (jours)"')]).toBe('"17"');
      expect(values[cols.indexOf('"Retard (jours)"')]).toBe('"8"');
    });

    it('laisse la colonne « Retard (jours) » vide quand la restitution n\'est pas en retard', async () => {
      const now = new Date('2026-09-18T10:00:00.000Z');
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          bon: { ...makeRow().bon, dateRestitution: new Date('2026-12-01T00:00:00.000Z') },
        }),
      ]);

      const { csv } = await service.getExportCsv({}, now);
      const [headerLine, dataLine] = csv.slice(1).split('\n');
      const cols = headerLine.split(';');

      expect(dataLine.split(';')[cols.indexOf('"Retard (jours)"')]).toBe('""');
    });

    it('affiche « — » (jamais null/undefined) quand le collaborateur n\'a pas d\'adresse email (compte manuel)', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          bon: { ...makeRow().bon, collaborateur: { id: 'u-2', displayName: 'Jean DUPONT', email: null, department: null } },
        }),
      ]);

      const { csv } = await service.getExportCsv({});
      const dataLine = csv.split('\n')[1];

      expect(dataLine).toContain('"—"');
      expect(dataLine).not.toContain('"null"');
      expect(dataLine).not.toContain('"undefined"');
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

  describe('InventoryQueryDto — tri (sort/direction) et filtre overdue', () => {
    it.each(['asc', 'desc'])('accepte la direction valide « %s »', async (direction) => {
      const dto = plainToInstance(InventoryQueryDto, { sort: 'dateMiseDisposition', direction });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejette une direction inconnue', async () => {
      const dto = plainToInstance(InventoryQueryDto, { direction: 'croissant' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isIn');
    });

    it.each(['1', 'true', 'TRUE', true])('accepte "overdue" en booléen ou chaîne « %s »', async (value) => {
      const dto = plainToInstance(InventoryQueryDto, { overdue: value });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.overdue).toBe(true);
    });

    it('traite toute chaîne non reconnue comme "false" (même convention que QueryBonsDto.overdue)', async () => {
      const dto = plainToInstance(InventoryQueryDto, { overdue: 'peut-être' });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.overdue).toBe(false);
    });

    it.each(['label', 'category', 'serialNumber', 'filiale', 'collaborateur', 'situation', 'dateMiseDisposition', 'dateRestitution'])(
      'accepte le champ de tri « %s »',
      async (sort) => {
        const dto = plainToInstance(InventoryQueryDto, { sort, direction: 'asc' });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it.each(['reference', 'bon.status', 'id; DROP TABLE bons', ''])(
      'rejette le champ de tri hors liste blanche « %s »',
      async (sort) => {
        const errors = await validate(plainToInstance(InventoryQueryDto, { sort }));
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('isIn');
      },
    );

    it('accepte le filtre « sansNumeroSerie=1 » (même convention que overdue)', async () => {
      const dto = plainToInstance(InventoryQueryDto, { sansNumeroSerie: '1' });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.sansNumeroSerie).toBe(true);
    });

    it('rejette une valeur "overdue" qui n\'est ni un booléen ni une chaîne', async () => {
      const dto = plainToInstance(InventoryQueryDto, { overdue: { nope: true } });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isBoolean');
    });
  });
});
