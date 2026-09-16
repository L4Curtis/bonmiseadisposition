import { KpiDelaisService } from '../kpi-delais.service';
import { resolvePeriod } from '../kpi-period';

describe('KpiDelaisService (squelette lot 2-core)', () => {
  const service = new KpiDelaisService({} as never, {} as never);
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });

  it('renvoie l’enveloppe attendue avec des blocs vides typés', async () => {
    const result = await service.getDelais(period, 'f1');

    expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
    expect(result.previous).toEqual(period.previous);
    expect(result.filialeId).toBe('f1');

    expect(result.volumes).toEqual({
      created: { current: 0, previous: null },
      sent: { current: 0, previous: null },
      archived: { current: 0, previous: null },
      cancelled: { current: 0, previous: null },
      series: [],
    });
    expect(result.statusBreakdown).toEqual([]);
    expect(result.creationToSend).toEqual({
      count: 0,
      medianHours: null,
      p90Hours: null,
      previous: { medianHours: null, p90Hours: null },
    });
    expect(result.sendToSignature.mise_disposition.count).toBe(0);
    expect(result.sendToSignature.restitution.previous).toEqual({
      medianHours: null,
      p90Hours: null,
      within48h: null,
      within7d: null,
    });
    expect(result.signatureMode).toEqual({
      inPerson: { current: 0, previous: null },
      remote: { current: 0, previous: null },
      proxy: { current: 0, previous: null },
    });
    expect(result.loanDuration).toEqual({
      count: 0,
      avgDays: { current: null, previous: null },
      medianDays: { current: null, previous: null },
    });
    expect(result.waiting).toEqual({ thresholdDays: 0, overdueTotal: 0, steps: [] });
  });

  it('filialeId vaut null par défaut si non fourni', async () => {
    const result = await service.getDelais(period);
    expect(result.filialeId).toBeNull();
  });
});
