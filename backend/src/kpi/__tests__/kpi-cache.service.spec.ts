import { KpiCacheService } from '../kpi-cache.service';

describe('KpiCacheService', () => {
  let service: KpiCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new KpiCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sert la valeur en cache tant que le TTL (60 s par défaut) n’est pas écoulé', async () => {
    const compute = vi.fn().mockResolvedValue('v1');

    const first = await service.getOrCompute('k', compute);
    vi.advanceTimersByTime(59_999);
    const second = await service.getOrCompute('k', compute);

    expect(first).toBe('v1');
    expect(second).toBe('v1');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recalcule après expiration du TTL', async () => {
    const compute = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

    await service.getOrCompute('k', compute);
    vi.advanceTimersByTime(60_001);
    const second = await service.getOrCompute('k', compute);

    expect(second).toBe('v2');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('respecte un TTL explicite différent du défaut', async () => {
    const compute = vi.fn().mockResolvedValue('v1');

    await service.getOrCompute('k', compute, 1_000);
    vi.advanceTimersByTime(1_001);
    await service.getOrCompute('k', compute, 1_000);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('dédoublonne deux appels concurrents sur la même clé (une seule promesse en vol)', async () => {
    let resolveCompute!: (value: string) => void;
    const compute = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveCompute = resolve; }),
    );

    const p1 = service.getOrCompute('k', compute);
    const p2 = service.getOrCompute('k', compute);

    expect(compute).toHaveBeenCalledTimes(1);
    resolveCompute('v');

    await expect(p1).resolves.toBe('v');
    await expect(p2).resolves.toBe('v');
  });

  it('ne met pas en cache une promesse rejetée : l’appel suivant recalcule', async () => {
    const compute = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    await expect(service.getOrCompute('k', compute)).rejects.toThrow('boom');
    const result = await service.getOrCompute('k', compute);

    expect(result).toBe('ok');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('évince la plus ancienne entrée (FIFO) au-delà de 200 clés', async () => {
    const compute = (n: number) => vi.fn().mockResolvedValue(`v${n}`);
    const firstCompute = compute(0);

    await service.getOrCompute('key-0', firstCompute);
    for (let i = 1; i < 200; i++) {
      // eslint-disable-next-line no-await-in-loop
      await service.getOrCompute(`key-${i}`, compute(i));
    }
    // 200 clés en cache ('key-0' … 'key-199') : ajouter une 201e évince 'key-0'.
    await service.getOrCompute('key-200', compute(200));

    // 'key-0' a été évincée : un nouvel appel recalcule au lieu de servir le cache.
    await service.getOrCompute('key-0', firstCompute);
    expect(firstCompute).toHaveBeenCalledTimes(2);
  });

  it('clear() vide le cache', async () => {
    const compute = vi.fn().mockResolvedValue('v1');

    await service.getOrCompute('k', compute);
    service.clear();
    await service.getOrCompute('k', compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
