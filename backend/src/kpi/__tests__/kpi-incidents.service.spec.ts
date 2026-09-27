import { Prisma } from '@prisma/client';
import { KpiIncidentsService, buildReminderStats } from '../kpi-incidents.service';
import { resolvePeriod } from '../kpi-period';
import type { Mock } from 'vitest';

/**
 * Garde-fous du SQL généré et de la mise en forme. Les chiffres eux-mêmes
 * (équipements et non déclarations, `skipped` exclus, remises et clôtures
 * séparées, Fondées / Non retenues) sont vérifiés contre une vraie base dans
 * `kpi.real-db.spec.ts`.
 */
describe('KpiIncidentsService', () => {
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });

  function serviceWith(queryRaw: Mock): KpiIncidentsService {
    return new KpiIncidentsService({ $queryRaw: queryRaw } as never);
  }

  /** Chaque requête reçoit une ligne vide : seuls le SQL et la forme comptent. */
  function emptyRows(): Mock {
    return vi.fn((query: Prisma.Sql) =>
      Promise.resolve(query.sql.includes('GROUP BY') ? [] : [{}]),
    );
  }

  function sqlOf(queryRaw: Mock): string[] {
    return queryRaw.mock.calls.map((call: unknown[]) => (call[0] as Prisma.Sql).sql);
  }

  it('renvoie des zéros et des null sur une période vide, avec `asOf`', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const result = await serviceWith(emptyRows()).getIncidents(period, undefined, now);
    expect(result.asOf).toBe('2026-08-10T12:00:00.000Z');
    expect(result.filialeId).toBeNull();
    expect(result.notReturned).toEqual({ declared: { current: 0, previous: 0 }, found: { current: 0, previous: 0 }, stillMissing: 0 });
    expect(result.contestations.resolutionMedianDays).toEqual({ current: null, previous: null });
    expect(result.reminders.byRank.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('caste chaque colonne enum comparée et ne compte jamais `skipped`', async () => {
    const queryRaw = emptyRows();
    await serviceWith(queryRaw).getIncidents(period);
    const all = sqlOf(queryRaw).join('\n');
    expect(all).not.toMatch(/\b(c|nl|b)\.status IN \(/);
    expect(all).not.toMatch(/\bnl\.type = /);
    expect(all).toContain("nl.status::text IN ('failed', 'bounced')");
    expect(all).not.toContain("'skipped'");
  });

  it('propage le filtre filiale à toutes les requêtes', async () => {
    const queryRaw = emptyRows();
    await serviceWith(queryRaw).getIncidents(period, 'f-1');
    for (const call of queryRaw.mock.calls) {
      const query = call[0] as Prisma.Sql;
      expect(query.sql).toContain('filiale_id =');
      expect(query.values).toContain('f-1');
    }
  });
});

describe('buildReminderStats', () => {
  it('garde les rangs 1 à 3, ajoute les rangs observés et calcule l’efficacité du courant', () => {
    const stats = buildReminderStats(
      [{ rank: 1, sent: 20n, signedAfter: 8n }, { rank: 4, sent: 5n, signedAfter: 1n }],
      [{ rank: 1, sent: 25n, signedAfter: 9n }],
    );
    expect(stats.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    expect(stats[0]).toEqual({ rank: 1, sent: { current: 20, previous: 25 }, signedAfter: { current: 8, previous: 9 }, efficiency: 0.4 });
    expect(stats[1].efficiency).toBeNull();
  });
});
