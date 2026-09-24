import 'reflect-metadata';
import { KpiController, cacheKey } from '../kpi.controller';
import { resolvePeriod } from '../kpi-period';
import type { Mock } from 'vitest';

describe('KpiController', () => {
  it('déclare les rôles admin, technician, direction (métadonnée `roles`)', () => {
    const roles = Reflect.getMetadata('roles', KpiController);
    expect(roles).toEqual(['admin', 'technician', 'direction']);
  });

  describe('routes', () => {
    let cache: { getOrCompute: Mock };
    let parcService: { getParc: Mock };
    let delaisService: { getDelais: Mock };
    let incidentsService: { getIncidents: Mock };
    let controller: KpiController;

    beforeEach(() => {
      cache = { getOrCompute: vi.fn((_key: string, compute: () => Promise<unknown>) => compute()) };
      parcService = { getParc: vi.fn().mockResolvedValue({ tag: 'parc' }) };
      delaisService = { getDelais: vi.fn().mockResolvedValue({ tag: 'delais' }) };
      incidentsService = { getIncidents: vi.fn().mockResolvedValue({ tag: 'incidents' }) };
      controller = new KpiController(
        cache as never,
        parcService as never,
        delaisService as never,
        incidentsService as never,
      );
    });

    it('GET /kpi/parc : résout la période, appelle le cache avec la clé attendue, transmet period/filialeId', async () => {
      const query = { from: '2026-08-01', to: '2026-08-10', filialeId: 'f1' };
      const result = await controller.getParc(query);
      const period = resolvePeriod(query);

      expect(cache.getOrCompute).toHaveBeenCalledWith(cacheKey('parc', period, 'f1'), expect.any(Function));
      expect(parcService.getParc).toHaveBeenCalledWith(period, 'f1');
      expect(result).toEqual({ tag: 'parc' });
    });

    it('GET /kpi/delais : même mécanique, filialeId absent', async () => {
      const query = { from: '2026-08-01', to: '2026-08-10' };
      await controller.getDelais(query);
      const period = resolvePeriod(query);

      expect(cache.getOrCompute).toHaveBeenCalledWith(
        cacheKey('delais', period, undefined),
        expect.any(Function),
      );
      expect(delaisService.getDelais).toHaveBeenCalledWith(period, undefined);
    });

    it('GET /kpi/incidents : même mécanique', async () => {
      const query = { from: '2026-08-01', to: '2026-08-10' };
      await controller.getIncidents(query);
      const period = resolvePeriod(query);

      expect(cache.getOrCompute).toHaveBeenCalledWith(
        cacheKey('incidents', period, undefined),
        expect.any(Function),
      );
      expect(incidentsService.getIncidents).toHaveBeenCalledWith(period, undefined);
    });
  });

  describe('cacheKey', () => {
    it('construit kpi:<endpoint>:<from>:<to>:<filialeId|"">', () => {
      const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });

      expect(cacheKey('parc', period, 'f1')).toBe('kpi:parc:2026-08-01:2026-08-10:f1');
      expect(cacheKey('parc', period)).toBe('kpi:parc:2026-08-01:2026-08-10:');
    });
  });
});
