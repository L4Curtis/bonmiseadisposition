import { Prisma } from '@prisma/client';
import { KpiDelaisService } from '../kpi-delais.service';
import { resolvePeriod } from '../kpi-period';
import type { Mock } from 'vitest';

/**
 * `$queryRaw` est mocké par ROUTAGE sur le texte SQL (jamais par ordre
 * d'appel) : chaque requête du service a une forme textuelle unique, sauf
 * les quatre paires courant/précédent (volumes, creationToSend,
 * sendToSignature, loanDuration) qui partagent le même texte — celles-ci
 * sont départagées par les valeurs liées (la date de début de la période
 * courante/précédente apparaît toujours parmi les paramètres).
 */

type RawQuery = Prisma.Sql;

const PERIOD = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });
const CURRENT_FROM = '2026-08-01';
const PREVIOUS_FROM = PERIOD.previous.from; // 2026-07-22

function createConfig(overdueDays: number) {
  return { getSignatureOverdueDays: vi.fn().mockResolvedValue(overdueDays) };
}

function createPrisma() {
  return { $queryRaw: vi.fn() };
}

/** Mock générique : toute requête renvoie `[]`. Utile pour les assertions
 *  qui ne portent que sur le SQL généré (casts, filtre filiale, seuil…). */
function mockEmpty(prisma: ReturnType<typeof createPrisma>) {
  (prisma.$queryRaw as Mock).mockResolvedValue([]);
}

interface Fixtures {
  volumeCurrent: unknown[];
  volumePrevious: unknown[];
  createdSeries: unknown[];
  sentSeries: unknown[];
  archivedSeries: unknown[];
  statusBreakdown: unknown[];
  creationToSendCurrent: unknown[];
  creationToSendPrevious: unknown[];
  sendToSignatureCurrent: unknown[];
  sendToSignaturePrevious: unknown[];
  loanDurationCurrent: unknown[];
  loanDurationPrevious: unknown[];
  waiting: unknown[];
}

/** Route chaque appel `$queryRaw` vers sa fixture selon le texte SQL (et,
 *  pour les quatre requêtes dupliquées courant/précédent, selon les valeurs
 *  liées). Toute requête non reconnue fait échouer le test explicitement. */
function mockRouted(prisma: ReturnType<typeof createPrisma>, fixtures: Fixtures) {
  (prisma.$queryRaw as Mock).mockImplementation((query: RawQuery) => {
    const sql = query.sql;
    const values = query.values;
    const isCurrent = values.includes(CURRENT_FROM);
    const isPrevious = values.includes(PREVIOUS_FROM);

    if (sql.includes('AS cancelled')) {
      return Promise.resolve(isCurrent ? fixtures.volumeCurrent : fixtures.volumePrevious);
    }
    if (sql.includes('GROUP BY bucket') && sql.includes('b.created_at') && !sql.includes('audit_logs')) {
      return Promise.resolve(fixtures.createdSeries);
    }
    if (sql.includes('GROUP BY bucket') && sql.includes('audit_logs a') && sql.includes("'bon_sent'")) {
      return Promise.resolve(fixtures.sentSeries);
    }
    if (sql.includes('GROUP BY bucket') && sql.includes('b.archived_at')) {
      return Promise.resolve(fixtures.archivedSeries);
    }
    if (sql.includes('GROUP BY b.status::text')) {
      return Promise.resolve(fixtures.statusBreakdown);
    }
    if (sql.includes('first_sent')) {
      return Promise.resolve(isCurrent ? fixtures.creationToSendCurrent : fixtures.creationToSendPrevious);
    }
    if (sql.includes('LAG(')) {
      return Promise.resolve(isCurrent ? fixtures.sendToSignatureCurrent : fixtures.sendToSignaturePrevious);
    }
    if (sql.includes('loan_start')) {
      return Promise.resolve(isCurrent ? fixtures.loanDurationCurrent : fixtures.loanDurationPrevious);
    }
    if (sql.includes('CASE b.status::text')) {
      return Promise.resolve(fixtures.waiting);
    }
    throw new Error(
      `Aucune route de test pour la requête (isCurrent=${isCurrent}, isPrevious=${isPrevious}) :\n${sql}\nvalues=${JSON.stringify(
        values,
      )}`,
    );
  });
}

const FULL_FIXTURES: Fixtures = {
  volumeCurrent: [{ created: 58n, sent: 52n, archived: 44n, cancelled: 3n }],
  volumePrevious: [{ created: 61n, sent: 60n, archived: 50n, cancelled: 1n }],
  createdSeries: [
    { bucket: '2026-08-01', count: 3n },
    { bucket: '2026-08-05', count: 2n },
    { bucket: '2026-08-10', count: 1n },
  ],
  sentSeries: [{ bucket: '2026-08-01', count: 2n }],
  archivedSeries: [{ bucket: '2026-08-02', count: 1n }],
  statusBreakdown: [
    { status: 'active', count: 120n },
    { status: 'archived', count: 30n },
  ],
  creationToSendCurrent: [{ count: 52n, medianHours: 5.2, p90Hours: 48.1 }],
  creationToSendPrevious: [{ count: 40n, medianHours: 6.0, p90Hours: 50.2 }],
  sendToSignatureCurrent: [
    { type: 'mise_disposition', count: 48n, medianHours: 20.5, p90Hours: 96, within48h: 34n, within7d: 44n, inPerson: 12n, proxy: 2n },
  ],
  sendToSignaturePrevious: [
    { type: 'mise_disposition', count: 40n, medianHours: 24, p90Hours: 110, within48h: 26n, within7d: 36n, inPerson: 9n, proxy: 1n },
  ],
  // avgDays en objet « Decimal-like » : vérifie la conversion via toNumber().
  loanDurationCurrent: [{ count: 44n, avgDays: { toNumber: () => 84.2 }, medianDays: 70 }],
  loanDurationPrevious: [{ count: 50n, avgDays: 90.1, medianDays: 75 }],
  waiting: [
    { step: 'mise_disposition', count: 12n, avgAgeDays: 4.1, overdue: 3n },
    { step: 'restitution', count: 5n, avgAgeDays: 2.0, overdue: 1n },
    { step: 'pv_cloture', count: 2n, avgAgeDays: 9.5, overdue: 2n },
  ],
};

describe('KpiDelaisService', () => {
  describe('getDelais — réponse complète', () => {
    it('assemble volumes, statuts, délais et attente avec conversions bigint/Decimal correctes', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockRouted(prisma, FULL_FIXTURES);
      const service = new KpiDelaisService(prisma as never, config as never);

      const result = await service.getDelais(PERIOD, 'fil-1');

      expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
      expect(result.previous).toEqual(PERIOD.previous);
      expect(result.filialeId).toBe('fil-1');

      // volumes : cur/prev distincts, tous des `number` (pas de bigint résiduel)
      expect(result.volumes.created).toEqual({ current: 58, previous: 61 });
      expect(result.volumes.sent).toEqual({ current: 52, previous: 60 });
      expect(result.volumes.archived).toEqual({ current: 44, previous: 50 });
      expect(result.volumes.cancelled).toEqual({ current: 3, previous: 1 });
      for (const v of Object.values(result.volumes.created)) expect(typeof v).toBe('number');

      // série : 10 buckets (jour), buckets non renseignés à 0
      expect(result.volumes.series).toHaveLength(10);
      expect(result.volumes.series[0]).toEqual({ bucket: '2026-08-01', created: 3, sent: 2, archived: 0 });
      expect(result.volumes.series[1]).toEqual({ bucket: '2026-08-02', created: 0, sent: 0, archived: 1 });
      expect(result.volumes.series[4]).toEqual({ bucket: '2026-08-05', created: 2, sent: 0, archived: 0 });
      expect(result.volumes.series[9]).toEqual({ bucket: '2026-08-10', created: 1, sent: 0, archived: 0 });

      // statusBreakdown : ordre fixe complet, statuts absents à 0
      expect(result.statusBreakdown.map((s) => s.status)).toEqual([
        'draft',
        'sent_mise_dispo',
        'active',
        'sent_restitution',
        'partially_returned',
        'contested',
        'archived',
        'cancelled',
      ]);
      expect(result.statusBreakdown.find((s) => s.status === 'active')).toEqual({
        status: 'active',
        label: 'En cours',
        count: 120,
      });
      expect(result.statusBreakdown.find((s) => s.status === 'draft')).toEqual({
        status: 'draft',
        label: 'Brouillon',
        count: 0,
      });

      // creationToSend
      expect(result.creationToSend).toEqual({
        count: 52,
        medianHours: 5.2,
        p90Hours: 48.1,
        previous: { medianHours: 6.0, p90Hours: 50.2 },
      });

      // sendToSignature : ratios calculés, type absent → tout à zéro/null
      expect(result.sendToSignature.mise_disposition).toEqual({
        count: 48,
        medianHours: 20.5,
        p90Hours: 96,
        within48h: 34 / 48,
        within7d: 44 / 48,
        previous: { medianHours: 24, p90Hours: 110, within48h: 26 / 40, within7d: 36 / 40 },
      });
      expect(result.sendToSignature.restitution).toEqual({
        count: 0,
        medianHours: null,
        p90Hours: null,
        within48h: null,
        within7d: null,
        previous: { medianHours: null, p90Hours: null, within48h: null, within7d: null },
      });
      expect(result.sendToSignature.pv_cloture).toEqual(result.sendToSignature.restitution);

      // signatureMode : remote = count − inPerson, sommé sur les types
      expect(result.signatureMode).toEqual({
        inPerson: { current: 12, previous: 9 },
        remote: { current: 36, previous: 31 },
        proxy: { current: 2, previous: 1 },
      });

      // loanDuration : conversion Decimal-like (avgDays courant)
      expect(result.loanDuration).toEqual({
        count: 44,
        avgDays: { current: 84.2, previous: 90.1 },
        medianDays: { current: 70, previous: 75 },
      });

      // waiting : overdueTotal = Σ steps.overdue, seuil dans la réponse
      expect(result.waiting.thresholdDays).toBe(7);
      expect(result.waiting.overdueTotal).toBe(6);
      expect(result.waiting.steps).toEqual([
        { step: 'mise_disposition', label: 'Signature mise à disposition', count: 12, avgAgeDays: 4.1, overdue: 3 },
        { step: 'restitution', label: 'Signature restitution', count: 5, avgAgeDays: 2, overdue: 1 },
        { step: 'pv_cloture', label: 'PV de non-restitution', count: 2, avgAgeDays: 9.5, overdue: 2 },
      ]);
    });

    it('filialeId vaut null par défaut si non fourni', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockRouted(prisma, FULL_FIXTURES);
      const service = new KpiDelaisService(prisma as never, config as never);

      const result = await service.getDelais(PERIOD);

      expect(result.filialeId).toBeNull();
    });
  });

  describe('SQL généré', () => {
    it('caste toutes les colonnes enum comparées et ne compare jamais un statut sans cast', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockEmpty(prisma);
      const service = new KpiDelaisService(prisma as never, config as never);

      await service.getDelais(PERIOD, 'fil-1');

      const calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      expect(calls.length).toBeGreaterThan(0);
      for (const [query] of calls) {
        expect(query.sql).not.toMatch(/b\.status IN \(/);
      }
      const allSql = calls.map(([q]) => q.sql).join('\n---\n');
      expect(allSql).toContain('b.status::text');
      expect(allSql).toContain('s.type::text');
      expect(allSql).toContain('nl.type::text');
      expect(allSql).toContain('nl.status::text');
      expect(allSql).toMatch(/COUNT\(\*\)::bigint/);
      expect(allSql).toMatch(/COUNT\(DISTINCT a\.bon_id\)::bigint/);
      expect(allSql).toMatch(/::float8/);
    });

    it('sendToSignature utilise LAG (signature précédente) et un repli -infinity pour la première demande', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockEmpty(prisma);
      const service = new KpiDelaisService(prisma as never, config as never);

      await service.getDelais(PERIOD);

      const calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      const lagCall = calls.find(([q]) => q.sql.includes('LAG('));
      expect(lagCall).toBeDefined();
      expect(lagCall![0].sql).toContain("'-infinity'::timestamp");
    });

    it('waiting utilise to_timestamp(1) et embarque le seuil configuré (7 puis 10)', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockEmpty(prisma);
      const service = new KpiDelaisService(prisma as never, config as never);

      await service.getDelais(PERIOD);
      let calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      let waitingCall = calls.find(([q]) => q.sql.includes('CASE b.status::text'));
      expect(waitingCall).toBeDefined();
      expect(waitingCall![0].sql).toContain('to_timestamp(1)');
      expect(waitingCall![0].values).toContain(7);

      (prisma.$queryRaw as Mock).mockClear();
      (config.getSignatureOverdueDays as Mock).mockResolvedValue(10);

      await service.getDelais(PERIOD);
      calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      waitingCall = calls.find(([q]) => q.sql.includes('CASE b.status::text'));
      expect(waitingCall![0].values).toContain(10);
    });

    it('ajoute le filtre filiale sur toutes les requêtes quand fourni, et sur aucune sinon', async () => {
      const prisma = createPrisma();
      const config = createConfig(7);
      mockEmpty(prisma);
      const service = new KpiDelaisService(prisma as never, config as never);

      await service.getDelais(PERIOD, 'fil-1');
      let calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      expect(calls.length).toBeGreaterThan(0);
      for (const [query] of calls) {
        expect(query.sql).toContain('b.filiale_id =');
      }

      (prisma.$queryRaw as Mock).mockClear();
      await service.getDelais(PERIOD);
      calls = (prisma.$queryRaw as Mock).mock.calls as [RawQuery][];
      expect(calls.length).toBeGreaterThan(0);
      for (const [query] of calls) {
        expect(query.sql).not.toContain('filiale_id');
      }
    });
  });
});
