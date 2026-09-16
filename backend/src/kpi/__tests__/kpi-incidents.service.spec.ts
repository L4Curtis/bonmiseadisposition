import { KpiIncidentsService } from '../kpi-incidents.service';
import { resolvePeriod } from '../kpi-period';

describe('KpiIncidentsService (squelette lot 2-core)', () => {
  const service = new KpiIncidentsService({} as never, {} as never);
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });

  it('renvoie l’enveloppe attendue avec des blocs vides typés', async () => {
    const result = await service.getIncidents(period, 'f1');

    expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
    expect(result.previous).toEqual(period.previous);
    expect(result.filialeId).toBe('f1');

    expect(result.notReturned).toEqual({
      declared: { current: 0, previous: null },
      found: { current: 0, previous: null },
    });
    expect(result.pvCloture).toEqual({ emitted: { current: 0, previous: null } });
    expect(result.unilateralClosures).toEqual({ count: { current: 0, previous: null }, reasons: [] });
    expect(result.cancellations).toEqual({ count: { current: 0, previous: null } });
    expect(result.contestations).toEqual({
      opened: { current: 0, previous: null },
      openNow: 0,
      closed: { current: 0, previous: null },
      resolutionMedianDays: { current: null, previous: null },
      acceptanceRate: { current: null, previous: null },
    });
    expect(result.reminders).toEqual({ byRank: [], bonsWithThreeOrMore: { current: 0, previous: null } });
    expect(result.failedEmails).toEqual({ count: { current: 0, previous: null } });
  });

  it('filialeId vaut null par défaut si non fourni', async () => {
    const result = await service.getIncidents(period);
    expect(result.filialeId).toBeNull();
  });
});
