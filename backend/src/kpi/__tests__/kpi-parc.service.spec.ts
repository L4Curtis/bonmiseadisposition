import { KpiParcService } from '../kpi-parc.service';
import { resolvePeriod } from '../kpi-period';

describe('KpiParcService (squelette lot 2-core)', () => {
  const service = new KpiParcService({} as never, {} as never);
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });

  it('renvoie l’enveloppe attendue avec des blocs vides typés', async () => {
    const result = await service.getParc(period, 'f1');

    expect(result.period).toEqual({ from: '2026-08-01', to: '2026-08-10', granularity: 'day', days: 10 });
    expect(result.previous).toEqual(period.previous);
    expect(result.filialeId).toBe('f1');

    expect(result.loaned).toEqual({
      total: 0,
      bons: 0,
      byCategory: [],
      byFiliale: [],
      topModels: [],
      offCatalogShare: null,
      serialCoverage: null,
      series: [],
    });
    expect(result.returnOverdue).toEqual({ bons: 0, equipments: 0, avgDays: null, medianDays: null, top: [] });
    expect(result.notReturned).toEqual({
      declared: { current: 0, previous: null },
      found: { current: 0, previous: null },
      closedBonsShare: { current: null, previous: null },
      openNow: 0,
    });
  });

  it('filialeId vaut null par défaut si non fourni', async () => {
    const result = await service.getParc(period);
    expect(result.filialeId).toBeNull();
  });
});
