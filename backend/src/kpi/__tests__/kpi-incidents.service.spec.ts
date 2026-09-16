import { Prisma } from '@prisma/client';
import { KpiIncidentsService } from '../kpi-incidents.service';
import { resolvePeriod } from '../kpi-period';

/**
 * `$queryRaw` est mocké par ROUTAGE sur le texte SQL (et non par ordre
 * d'appel) : chaque requête logique du service est identifiée par une
 * sous-chaîne unique de son SQL, puis courant/précédent est distingué en
 * cherchant la borne de date (`period.from` vs `period.previous.from`) dans
 * les valeurs liées. Cela reste correct même si l'ordre des `Promise.all`
 * change côté service.
 */
interface QueryRoute {
  match: (sql: string) => boolean;
  current: unknown;
  previous?: unknown;
}

function createRoutedQueryRaw(period: ReturnType<typeof resolvePeriod>, routes: QueryRoute[]) {
  return jest.fn((query: Prisma.Sql) => {
    const route = routes.find((r) => r.match(query.sql));
    if (!route) {
      throw new Error(`Requête SQL non gérée par le mock de test : ${query.sql}`);
    }
    if (route.previous === undefined) {
      return Promise.resolve(route.current);
    }
    const isPrevious = query.values.includes(period.previous.from);
    return Promise.resolve(isPrevious ? route.previous : route.current);
  });
}

describe('KpiIncidentsService', () => {
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });
  // previousRange : même longueur (10 j), se terminant la veille de `from`
  // → { from: '2026-07-22', to: '2026-07-31' } (vérifié dans le premier test).

  const AUDIT_COUNTS_CURRENT = { declared: 4n, found: 1n, pvEmitted: 3n, unilateral: 2n, cancelled: 3n };
  const AUDIT_COUNTS_PREVIOUS = { declared: 6n, found: 2n, pvEmitted: 2n, unilateral: 0n, cancelled: 1n };
  const REASONS_CURRENT = [{ reason: 'Collaborateur parti', count: 2n }];
  const CONTESTATIONS_CURRENT = { opened: 2n, closed: 2n, resolved: 1n, medianDays: 1.5 };
  const CONTESTATIONS_PREVIOUS = { opened: 1n, closed: 1n, resolved: 1n, medianDays: 3 };
  const OPEN_NOW = { count: 1n };
  const REMINDERS_CURRENT = [
    { rank: 1, sent: 20n, signedAfter: 8n },
    { rank: 4, sent: 5n, signedAfter: 1n },
  ];
  const REMINDERS_PREVIOUS = [{ rank: 1, sent: 25n, signedAfter: 9n }];
  const THREE_OR_MORE_CURRENT = { count: 3n };
  const THREE_OR_MORE_PREVIOUS = { count: 5n };
  const FAILED_CURRENT = { count: 3n };
  const FAILED_PREVIOUS = { count: 1n };

  function buildRoutes(): QueryRoute[] {
    return [
      {
        match: (sql) => sql.includes("a.action = 'declare_not_returned'") && sql.includes('bon_cancelled'),
        current: [AUDIT_COUNTS_CURRENT],
        previous: [AUDIT_COUNTS_PREVIOUS],
      },
      {
        match: (sql) => sql.includes("btrim(a.details->>'reason'"),
        current: REASONS_CURRENT,
      },
      {
        match: (sql) => sql.includes('percentile_cont'),
        current: [CONTESTATIONS_CURRENT],
        previous: [CONTESTATIONS_PREVIOUS],
      },
      {
        match: (sql) => sql.includes("c.status::text IN ('open', 'in_review')"),
        current: [OPEN_NOW],
      },
      {
        match: (sql) => sql.includes('GROUP BY nl.reminder_number'),
        current: REMINDERS_CURRENT,
        previous: REMINDERS_PREVIOUS,
      },
      {
        match: (sql) => sql.includes('COUNT(DISTINCT nl.bon_id)'),
        current: [THREE_OR_MORE_CURRENT],
        previous: [THREE_OR_MORE_PREVIOUS],
      },
      {
        match: (sql) => sql.includes("nl.status::text = 'failed'"),
        current: [FAILED_CURRENT],
        previous: [FAILED_PREVIOUS],
      },
    ];
  }

  function buildService(routes: QueryRoute[] = buildRoutes()) {
    const prisma = { $queryRaw: createRoutedQueryRaw(period, routes) };
    const service = new KpiIncidentsService(prisma as never, {} as never);
    return { service, prisma };
  }

  it('renvoie l’enveloppe complète, BigInt convertis, courant/précédent distincts', async () => {
    const { service } = buildService();

    const result = await service.getIncidents(period, 'f1');

    expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
    expect(result.previous).toEqual({ from: '2026-07-22', to: '2026-07-31' });
    expect(result.filialeId).toBe('f1');

    expect(result.notReturned).toEqual({
      declared: { current: 4, previous: 6 },
      found: { current: 1, previous: 2 },
    });
    expect(result.pvCloture).toEqual({ emitted: { current: 3, previous: 2 } });
    expect(result.unilateralClosures).toEqual({
      count: { current: 2, previous: 0 },
      reasons: [{ reason: 'Collaborateur parti', count: 2 }],
    });
    expect(result.cancellations).toEqual({ count: { current: 3, previous: 1 } });

    expect(result.contestations).toEqual({
      opened: { current: 2, previous: 1 },
      openNow: 1,
      closed: { current: 2, previous: 1 },
      resolutionMedianDays: { current: 1.5, previous: 3 },
      acceptanceRate: { current: 0.5, previous: 1 },
    });

    expect(result.reminders).toEqual({
      byRank: [
        { rank: 1, sent: { current: 20, previous: 25 }, signedAfter: { current: 8, previous: 9 }, efficiency: 0.4 },
        { rank: 2, sent: { current: 0, previous: 0 }, signedAfter: { current: 0, previous: 0 }, efficiency: null },
        { rank: 3, sent: { current: 0, previous: 0 }, signedAfter: { current: 0, previous: 0 }, efficiency: null },
        { rank: 4, sent: { current: 5, previous: 0 }, signedAfter: { current: 1, previous: 0 }, efficiency: 0.2 },
      ],
      bonsWithThreeOrMore: { current: 3, previous: 5 },
    });

    expect(result.failedEmails).toEqual({ count: { current: 3, previous: 1 } });
  });

  it('filialeId absent par défaut (null) si non fourni', async () => {
    const { service } = buildService();
    const result = await service.getIncidents(period);
    expect(result.filialeId).toBeNull();
  });

  it('exécute exactement 12 requêtes SQL (compteurs, motifs, contestations x3, rappels, ≥3 rappels, emails en échec)', async () => {
    const { service, prisma } = buildService();
    await service.getIncidents(period, 'f1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(12);
  });

  describe('casts et garde-fous SQL', () => {
    it('caste chaque colonne enum comparée et n’utilise jamais `status IN (` sans cast', async () => {
      const { service, prisma } = buildService();
      await service.getIncidents(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      expect(calls.length).toBeGreaterThan(0);
      for (const [query] of calls) {
        expect(query.sql).not.toContain('status IN (');
      }

      const contestationsCalls = calls.filter(([q]) => q.sql.includes('FROM contestations c'));
      expect(contestationsCalls.length).toBeGreaterThanOrEqual(3); // flow (cur+prev) + openNow
      for (const [query] of contestationsCalls) {
        expect(query.sql).toContain('c.status::text');
      }

      const reminderCalls = calls.filter(([q]) => q.sql.includes('FROM notification_logs nl'));
      expect(reminderCalls.length).toBeGreaterThan(0);
      for (const [query] of reminderCalls) {
        expect(query.sql).toMatch(/nl\.status::text/);
      }
      const remindersByRankCall = calls.find(([q]) => q.sql.includes('GROUP BY nl.reminder_number'));
      expect(remindersByRankCall?.[0].sql).toMatch(/nl\.type::text/);
    });

    it('les motifs de clôture lisent `details->>\'reason\'` avec repli « Non renseigné »', async () => {
      const { service, prisma } = buildService();
      await service.getIncidents(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      const reasonsCall = calls.find(([q]) => q.sql.includes("btrim(a.details->>'reason'"));
      expect(reasonsCall).toBeDefined();
      expect(reasonsCall?.[0].sql).toContain("a.details->>'reason'");
      expect(reasonsCall?.[0].sql).toContain('Non renseigné');
    });

    it('`bonsWithThreeOrMore` filtre `reminder_number >= 3`', async () => {
      const { service, prisma } = buildService();
      await service.getIncidents(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      const threeOrMoreCall = calls.find(([q]) => q.sql.includes('COUNT(DISTINCT nl.bon_id)'));
      expect(threeOrMoreCall?.[0].sql).toContain('nl.reminder_number >= 3');
    });
  });

  describe('filtre filiale', () => {
    it('propage `filiale_id =` à toutes les requêtes quand `filialeId` est fourni', async () => {
      const { service, prisma } = buildService();
      await service.getIncidents(period, 'f1');

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      expect(calls).toHaveLength(12);
      for (const [query] of calls) {
        expect(query.sql).toContain('filiale_id');
        expect(query.values).toContain('f1');
      }
    });

    it('n’ajoute `filiale_id` à aucune requête quand `filialeId` est absent', async () => {
      const { service, prisma } = buildService();
      await service.getIncidents(period);

      const calls = (prisma.$queryRaw as jest.Mock).mock.calls as [Prisma.Sql][];
      expect(calls).toHaveLength(12);
      for (const [query] of calls) {
        expect(query.sql).not.toContain('filiale_id');
      }
    });
  });

  describe('ratios et cas limites', () => {
    it('`acceptanceRate` et `resolutionMedianDays` sont `null` quand `closed` vaut 0', async () => {
      const routes = buildRoutes();
      const contestationsRoute = routes.find((r) => r.match('percentile_cont'));
      if (contestationsRoute) {
        contestationsRoute.current = [{ opened: 0n, closed: 0n, resolved: 0n, medianDays: null }];
        contestationsRoute.previous = [{ opened: 0n, closed: 0n, resolved: 0n, medianDays: null }];
      }
      const { service } = buildService(routes);

      const result = await service.getIncidents(period, 'f1');

      expect(result.contestations.acceptanceRate).toEqual({ current: null, previous: null });
      expect(result.contestations.resolutionMedianDays).toEqual({ current: null, previous: null });
    });

    it('`efficiency` est `null` quand aucun rappel n’a été envoyé pour un rang', async () => {
      const routes = buildRoutes();
      const remindersRoute = routes.find((r) => r.match('GROUP BY nl.reminder_number'));
      if (remindersRoute) {
        remindersRoute.current = [];
        remindersRoute.previous = [];
      }
      const { service } = buildService(routes);

      const result = await service.getIncidents(period, 'f1');

      expect(result.reminders.byRank).toEqual([
        { rank: 1, sent: { current: 0, previous: 0 }, signedAfter: { current: 0, previous: 0 }, efficiency: null },
        { rank: 2, sent: { current: 0, previous: 0 }, signedAfter: { current: 0, previous: 0 }, efficiency: null },
        { rank: 3, sent: { current: 0, previous: 0 }, signedAfter: { current: 0, previous: 0 }, efficiency: null },
      ]);
    });
  });
});
