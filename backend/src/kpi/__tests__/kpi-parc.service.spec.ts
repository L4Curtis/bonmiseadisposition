import { Prisma } from '@prisma/client';
import { KpiParcService } from '../kpi-parc.service';
import { KpiPeriod, resolvePeriod } from '../kpi-period';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';

interface RouterOptions {
  totalEquipments?: bigint;
  offCatalog?: bigint;
  withSerial?: number | { toNumber: () => number };
  closedCurrent?: { archived: bigint; withNotReturned: bigint };
  closedPrevious?: { archived: bigint; withNotReturned: bigint };
  situationRows?: { situation: string; count: bigint }[];
}

/** Route `$queryRaw` sur le texte SQL généré (pas sur l'ordre d'appel) :
 *  chaque requête du service a une signature textuelle unique, et les
 *  requêtes appelées deux fois (courante/précédente) se distinguent par la
 *  date `from` liée en paramètre. */
function buildRouter(period: KpiPeriod, opts: RouterOptions = {}) {
  const totalEquipments = opts.totalEquipments ?? 120n;
  const offCatalog = opts.offCatalog ?? 10n;
  const withSerial = opts.withSerial ?? { toNumber: () => 112 };
  const closedCurrent = opts.closedCurrent ?? { archived: 10n, withNotReturned: 2n };
  const closedPrevious = opts.closedPrevious ?? { archived: 10n, withNotReturned: 1n };
  // Par défaut, toute la « masse » du parc est en_circulation : garantit que
  // bySituation.sum === loaned.total même quand le test ne le vérifie pas
  // explicitement (ex. cas totalEquipments = 0).
  const situationRows = opts.situationRows ?? [{ situation: 'en_circulation', count: totalEquipments }];

  return (query: Prisma.Sql): Promise<unknown[]> => {
    const sql = query.sql;
    const values = query.values as unknown[];
    const isPreviousRange = values.includes(period.previous.from);

    if (sql.includes('AS total, COUNT(DISTINCT b.id)')) {
      return Promise.resolve([{ total: totalEquipments, bons: 80n }]);
    }
    if (sql.includes("GROUP BY COALESCE(ec.category::text, 'autre')")) {
      return Promise.resolve([
        { category: 'pc_portable', count: 70n },
        { category: 'ecran', count: 50n },
      ]);
    }
    if (sql.includes('GROUP BY f.id, f.display_name')) {
      return Promise.resolve([{ filialeId: 'f1', name: 'Paris', count: 90n }]);
    }
    if (sql.includes('AS situation, COUNT(*)')) {
      return Promise.resolve(situationRows);
    }
    if (sql.includes('"catalogItemId"')) {
      return Promise.resolve([
        { catalogItemId: 'c1', brand: 'Dell', model: 'Latitude 5540', category: 'pc_portable', count: 31n },
      ]);
    }
    if (sql.includes('"offCatalog"')) {
      return Promise.resolve([{ offCatalog, withSerial }]);
    }
    if (sql.includes('generate_series')) {
      return Promise.resolve([
        { bucket: '2026-08-02', count: 5n },
        { bucket: new Date('2026-08-05T00:00:00.000Z'), count: 3n },
      ]);
    }
    if (sql.includes('"bonId"')) {
      return Promise.resolve([
        {
          bonId: 'b1',
          reference: 'BMD-2026-0042',
          filiale: 'Paris',
          collaborateur: 'Jean Dupont',
          dateRestitution: new Date('2026-09-01T00:00:00.000Z'),
          daysLate: 15,
          equipments: 3n,
        },
      ]);
    }
    if (sql.includes('"avgDays"')) {
      return Promise.resolve([{ bons: 9n, equipments: 14n, avgDays: { toNumber: () => 12.4 }, medianDays: 8 }]);
    }
    if (sql.includes('a.created_at')) {
      return Promise.resolve(isPreviousRange ? [{ declared: 6n, found: 2n }] : [{ declared: 4n, found: 1n }]);
    }
    if (sql.includes('b.archived_at')) {
      return Promise.resolve([isPreviousRange ? closedPrevious : closedCurrent]);
    }
    if (sql.includes("NOT IN ('archived', 'cancelled')")) {
      return Promise.resolve([{ count: 7n }]);
    }
    return Promise.resolve([]);
  };
}

function sqlCalls(prisma: ReturnType<typeof createMockPrismaService>): string[] {
  return (prisma.$queryRaw as jest.Mock).mock.calls.map((call: unknown[]) => (call[0] as Prisma.Sql).sql);
}

describe('KpiParcService', () => {
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof createMockConfigService>;
  let service: KpiParcService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = createMockConfigService();
    service = new KpiParcService(prisma as never, config as never);
  });

  it('renvoie le contrat complet (filiale fournie), BigInt et Decimal-like convertis en number', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(
      buildRouter(period, {
        situationRows: [
          { situation: 'en_attente_signature', count: 20n },
          { situation: 'en_circulation', count: 90n },
          { situation: 'en_litige', count: 10n },
        ],
      }),
    );

    const result = await service.getParc(period, 'f1');

    expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
    expect(result.previous).toEqual(period.previous);
    expect(result.filialeId).toBe('f1');

    expect(result.loaned.total).toBe(120);
    expect(result.loaned.bons).toBe(80);
    expect(result.loaned.byCategory).toEqual([
      { category: 'pc_portable', label: 'PC portable', count: 70 },
      { category: 'ecran', label: 'Écran', count: 50 },
    ]);
    expect(result.loaned.byFiliale).toEqual([{ filialeId: 'f1', name: 'Paris', count: 90 }]);
    expect(result.loaned.bySituation).toEqual([
      { situation: 'en_attente_signature', label: 'En attente de signature', count: 20 },
      { situation: 'en_circulation', label: 'En circulation', count: 90 },
      { situation: 'en_litige', label: 'En litige', count: 10 },
    ]);
    // Invariant verrouillé par l'audit : la somme des situations égale le total.
    expect(result.loaned.bySituation.reduce((sum, s) => sum + s.count, 0)).toBe(result.loaned.total);
    expect(result.loaned.topModels).toEqual([
      { catalogItemId: 'c1', label: 'Dell Latitude 5540', category: 'pc_portable', count: 31 },
    ]);
    expect(result.loaned.offCatalogShare).toBeCloseTo(10 / 120);
    expect(result.loaned.serialCoverage).toBeCloseTo(112 / 120);

    expect(result.loaned.series).toHaveLength(10);
    expect(result.loaned.series.find((p) => p.bucket === '2026-08-01')?.count).toBe(0);
    expect(result.loaned.series.find((p) => p.bucket === '2026-08-02')?.count).toBe(5);
    expect(result.loaned.series.find((p) => p.bucket === '2026-08-05')?.count).toBe(3);
    expect(result.loaned.series.find((p) => p.bucket === '2026-08-10')?.count).toBe(0);

    expect(result.returnOverdue).toEqual({
      bons: 9,
      equipments: 14,
      avgDays: 12.4,
      medianDays: 8,
      top: [
        {
          bonId: 'b1',
          reference: 'BMD-2026-0042',
          filiale: 'Paris',
          collaborateur: 'Jean Dupont',
          dateRestitution: '2026-09-01',
          daysLate: 15,
          equipments: 3,
        },
      ],
    });

    expect(result.notReturned.declared).toEqual({ current: 4, previous: 6 });
    expect(result.notReturned.found).toEqual({ current: 1, previous: 2 });
    expect(result.notReturned.closedBonsShare).toEqual({ current: 0.2, previous: 0.1 });
    expect(result.notReturned.openNow).toBe(7);
  });

  it('filialeId absent → null dans l’enveloppe', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
    const result = await service.getParc(period);
    expect(result.filialeId).toBeNull();
  });

  it('caste les colonnes enum et ne compare jamais un statut sans cast', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
    await service.getParc(period, 'f1');

    const calls = sqlCalls(prisma);
    expect(calls.length).toBeGreaterThanOrEqual(14);

    for (const sql of calls) {
      expect(sql).not.toMatch(/b\.status\s+(NOT\s+)?IN\s*\(/);
    }
    expect(calls.some((sql) => sql.includes('b.status::text IN ('))).toBe(true);
    expect(calls.some((sql) => sql.includes("b.status::text NOT IN ('archived', 'cancelled')"))).toBe(true);
    expect(calls.some((sql) => sql.includes('ec.category::text'))).toBe(true);
    expect(calls.some((sql) => sql.includes('s.type::text'))).toBe(true);

    const seriesSql = calls.find((sql) => sql.includes('generate_series'));
    expect(seriesSql).toBeDefined();
    expect(seriesSql).toContain("AT TIME ZONE 'Europe/Paris'");
  });

  describe('alignement parc en circulation (audit 2026-09-18 : sent_mise_dispo et contested)', () => {
    it('la série historique utilise la même définition de statuts que le total instantané (PARC_BON_STATUSES), plus la dérogation archived_at pour les bons désormais archivés', async () => {
      (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
      await service.getParc(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls.map((call: unknown[]) => call[0] as Prisma.Sql);
      const totalsSql = calls.find((q) => q.sql.includes('AS total, COUNT(DISTINCT b.id)'));
      const seriesSql = calls.find((q) => q.sql.includes('generate_series'));
      expect(totalsSql).toBeDefined();
      expect(seriesSql).toBeDefined();

      // Ancienne définition ("tout sauf cancelled") supprimée : elle incluait
      // à tort les bons contested/sent_mise_dispo dans la série mais pas dans
      // le total, faisant diverger le dernier point de la courbe et la tuile.
      expect(seriesSql!.sql).not.toMatch(/b\.status::text\s*<>\s*'cancelled'/);
      // Statuts PARC_BON_STATUSES liés comme paramètres (pas de concaténation),
      // identiques à ceux de la requête de total.
      const parcStatuses = ['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested'];
      for (const status of parcStatuses) {
        expect(totalsSql!.values).toContain(status);
        expect(seriesSql!.values).toContain(status);
      }
      // Dérogation explicite pour les bons déjà archivés (comptés sur les
      // buckets antérieurs à leur archivage effectif).
      expect(seriesSql!.sql).toContain("b.status::text = 'archived'");
      expect(seriesSql!.sql).toContain('b.archived_at >=');
    });

    it('loaned.total, la série et bySituation partagent le même jeu de statuts (PARC_BON_STATUSES) dans toutes les requêtes concernées', async () => {
      (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
      await service.getParc(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls.map((call: unknown[]) => call[0] as Prisma.Sql);
      const parcStatuses = ['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested'];

      const queriesUsingParcStatuses = [
        calls.find((q) => q.sql.includes('AS total, COUNT(DISTINCT b.id)')), // loanedTotalsQuery
        calls.find((q) => q.sql.includes("GROUP BY COALESCE(ec.category::text, 'autre')")), // loanedByCategoryQuery
        calls.find((q) => q.sql.includes('GROUP BY f.id, f.display_name')), // loanedByFilialeQuery
        calls.find((q) => q.sql.includes('AS situation, COUNT(*)')), // loanedBySituationQuery
        calls.find((q) => q.sql.includes('"catalogItemId"')), // topModelsQuery
        calls.find((q) => q.sql.includes('"offCatalog"')), // shareCountsQuery
        calls.find((q) => q.sql.includes('"avgDays"')), // returnOverdueAggregateQuery (lateBonsCte)
        calls.find((q) => q.sql.includes('"bonId"')), // returnOverdueTopQuery (lateBonsCte)
      ];

      for (const query of queriesUsingParcStatuses) {
        expect(query).toBeDefined();
        for (const status of parcStatuses) {
          expect(query!.values).toContain(status);
        }
      }
    });
  });

  it('ajoute le filtre filiale à toutes les requêtes quand filialeId est fourni', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
    await service.getParc(period, 'f1');

    const calls = sqlCalls(prisma);
    expect(calls.length).toBeGreaterThan(0);
    for (const sql of calls) {
      expect(sql).toContain('filiale_id =');
    }
  });

  it('n’ajoute aucun filtre filiale quand filialeId est absent', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(buildRouter(period));
    await service.getParc(period);

    const calls = sqlCalls(prisma);
    expect(calls.length).toBeGreaterThan(0);
    for (const sql of calls) {
      expect(sql).not.toContain('filiale_id =');
    }
  });

  it('ratios null quand le dénominateur est nul', async () => {
    (prisma.$queryRaw as jest.Mock).mockImplementation(
      buildRouter(period, {
        totalEquipments: 0n,
        offCatalog: 0n,
        withSerial: 0,
        closedCurrent: { archived: 0n, withNotReturned: 0n },
        closedPrevious: { archived: 0n, withNotReturned: 0n },
      }),
    );

    const result = await service.getParc(period, 'f1');

    expect(result.loaned.total).toBe(0);
    expect(result.loaned.offCatalogShare).toBeNull();
    expect(result.loaned.serialCoverage).toBeNull();
    expect(result.notReturned.closedBonsShare).toEqual({ current: null, previous: null });
  });
});
