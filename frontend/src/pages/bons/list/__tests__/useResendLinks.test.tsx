import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), getBlob: vi.fn() } };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api, ApiError } from '@/lib/api';
import { useResendLinks, RESEND_CHUNK_SIZE } from '../useResendLinks';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `bon-${i + 1}`);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useResendLinks — relance d’un bon', () => {
  it('renvoie le lien puis recharge la liste', async () => {
    const onDone = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResendLinks(onDone));

    await act(async () => { await result.current.resendOne('b1', 'BMD-1'); });

    expect(api.post).toHaveBeenCalledWith('/bons/b1/resend', undefined);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.confirmation).toBeNull();
  });

  it('demande confirmation si un lien a été envoyé il y a moins d’une heure, puis force', async () => {
    const onDone = vi.fn();
    const sentAt = new Date().toISOString();
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(409, 'conflit', { code: 'token_recent', sentAt }))
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useResendLinks(onDone));

    await act(async () => { await result.current.resendOne('b1', 'BMD-1'); });
    expect(result.current.confirmation).toEqual({ bonId: 'b1', reference: 'BMD-1', sentAt });
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => { await result.current.resendOne('b1', 'BMD-1', true); });
    expect(api.post).toHaveBeenLastCalledWith('/bons/b1/resend', { force: true });
    expect(result.current.confirmation).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('useResendLinks — relance groupée', () => {
  it('envoie des lots successifs (jamais en parallèle) et produit le compte rendu', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(api.post).mockImplementation(async (_path: string, body?: unknown) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      const batch = (body as { ids: string[] }).ids;
      return { results: batch.map((id) => (id === 'bon-2' ? { id, outcome: 'skipped', reason: 'récent' } : { id, outcome: 'sent' })) };
    });
    const onDone = vi.fn();
    const { result } = renderHook(() => useResendLinks(onDone));

    await act(async () => {
      await result.current.resendMany(ids(12), false, [{ id: 'bon-x', outcome: 'skipped', reason: 'Pas en attente' }]);
    });

    expect(api.post).toHaveBeenCalledTimes(Math.ceil(12 / RESEND_CHUNK_SIZE));
    expect(vi.mocked(api.post).mock.calls[0]).toEqual(['/bons/resend-batch', { ids: ids(5), force: false }]);
    expect(maxInFlight).toBe(1);
    expect(result.current.progress).toBeNull();
    expect(result.current.report?.sent).toHaveLength(11);
    expect(result.current.report?.skipped.map((r) => r.id)).toEqual(['bon-2', 'bon-x']);
    expect(result.current.report?.failed).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('transmet force au serveur', async () => {
    vi.mocked(api.post).mockResolvedValue({ results: [{ id: 'bon-1', outcome: 'sent' }] });
    const { result } = renderHook(() => useResendLinks(vi.fn()));

    await act(async () => { await result.current.resendMany(['bon-1'], true); });

    expect(api.post).toHaveBeenCalledWith('/bons/resend-batch', { ids: ['bon-1'], force: true });
  });

  it('s’arrête au premier lot refusé et compte le reste en échec', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ results: ids(5).map((id) => ({ id, outcome: 'sent' })) })
      .mockRejectedValueOnce(new ApiError(429, 'Trop de requêtes, réessayez dans une minute.'));
    const { result } = renderHook(() => useResendLinks(vi.fn()));

    await act(async () => { await result.current.resendMany(ids(12), false); });

    expect(api.post).toHaveBeenCalledTimes(2);
    expect(result.current.report?.sent).toHaveLength(5);
    expect(result.current.report?.failed).toHaveLength(7);
    expect(result.current.report?.failed[0].reason).toBe('Trop de requêtes, réessayez dans une minute.');
  });
});
