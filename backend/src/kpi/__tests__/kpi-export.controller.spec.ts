import 'reflect-metadata';
import type { Response } from 'express';
import { KpiController } from '../kpi.controller';
import type { KpiDelaisResponse, KpiIncidentsResponse, KpiParcResponse } from '../kpi-types';

/**
 * Routes « Exporter ces indicateurs » : mêmes chiffres que l'onglet (même
 * cache, même période, même filiale), fichier nommé par sa période, envoyé
 * par `sendCsv` (en-têtes lisibles par le navigateur).
 */
describe('KpiController — exports des onglets', () => {
  const envelope = {
    asOf: '2026-09-30T10:00:00.000Z',
    period: { from: '2026-09-01', to: '2026-09-30', granularity: 'week' as const, days: 30 },
    previous: { from: '2026-08-02', to: '2026-08-31' },
    filialeId: 'f1',
  };
  const zero = { current: 0, previous: 0 };
  const emptyRatio = { current: null, previous: null };
  const parc = {
    ...envelope,
    loaned: { total: 0, bons: 0, byCategory: [], byFiliale: [], bySituation: [], topModels: [], offCatalogShare: null, serialCoverage: null, series: [] },
    returnOverdue: { bons: 0, equipments: 0, avgDays: null, medianDays: null, top: [] },
    notReturned: { declared: zero, found: zero, closedBonsShare: emptyRatio, openNow: 0 },
  } satisfies KpiParcResponse;

  const buildResponse = () => {
    const headers: Record<string, string> = {};
    const sent: string[] = [];
    const res = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      append: (k: string, v: string) => { headers[k] = v; },
      send: (body: string) => { sent.push(body); },
    } as unknown as Response;
    return { res, headers, sent };
  };

  const build = () => {
    const cache = { getOrCompute: vi.fn((_key: string, compute: () => Promise<unknown>) => compute()) };
    const parcService = { getParc: vi.fn().mockResolvedValue(parc) };
    const delaisService = { getDelais: vi.fn().mockResolvedValue({} as KpiDelaisResponse) };
    const incidentsService = { getIncidents: vi.fn().mockResolvedValue({} as KpiIncidentsResponse) };
    const exportService = { filialeName: vi.fn().mockResolvedValue('Paris') };
    const controller = new KpiController(
      cache as never, parcService as never, delaisService as never, incidentsService as never,
      {} as never, {} as never, exportService as never,
    );
    return { controller, cache, parcService, exportService };
  };

  it('GET /kpi/parc/export : chiffres de l’onglet (via le cache), filiale nommée, fichier daté par la période', async () => {
    const { controller, cache, parcService, exportService } = build();
    const { res, headers, sent } = buildResponse();

    await controller.exportParc({ from: '2026-09-01', to: '2026-09-30', filialeId: 'f1' }, res);

    expect(cache.getOrCompute).toHaveBeenCalledWith('kpi:parc:2026-09-01:2026-09-30:f1', expect.any(Function));
    expect(parcService.getParc).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-01', to: '2026-09-30' }), 'f1');
    expect(exportService.filialeName).toHaveBeenCalledWith('f1');
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toBe('attachment; filename="indicateurs-parc-2026-09-01-au-2026-09-30.csv"');
    expect(headers['Access-Control-Expose-Headers']).toContain('Content-Disposition');
    expect(sent[0]).toContain('"Filiale";"";"Paris"');
  });

  it.each(['exportParc', 'exportDelais', 'exportIncidents'] as const)(
    '%s : ouvert à l’IT et à la direction (rôles du contrôleur)',
    (method) => {
      expect(Reflect.getMetadata('roles', KpiController.prototype[method])).toBeUndefined();
      expect(Reflect.getMetadata('roles', KpiController)).toEqual(['admin', 'technician', 'direction']);
    },
  );
});
