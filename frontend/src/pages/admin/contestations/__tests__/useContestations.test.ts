import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContestations } from '../useContestations';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getBlob: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

const contestation = {
  id: 'c1',
  message: 'Écran cassé à réception',
  status: 'open' as const,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  bon: { id: 'b1', reference: 'BMD-2026-0001', status: 'active', filiale: { displayName: 'Paris' } },
  user: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com' },
};

function response(overrides: Record<string, unknown> = {}) {
  return { contestations: [contestation], total: 1, page: 1, limit: 20, openCount: 1, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useContestations', () => {
  it('charge la liste avec le filtre "open" par défaut', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderHook(() => useContestations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=open'));
    expect(result.current.data?.contestations).toHaveLength(1);
    expect(result.current.openCount).toBe(1);
  });

  it('setStatusFilter remet la page à 1 et relance le chargement avec le nouveau statut', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderHook(() => useContestations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setStatusFilter('resolved'));

    expect(result.current.page).toBe(1);
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('status=resolved')));
  });

  it('signale une erreur de chargement, distincte d’une liste vide', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useContestations());

    await waitFor(() => expect(result.current.loadError).toBe('boom'));
    expect(result.current.data).toBeNull();
  });

  it('handleReview appelle PATCH /contestations/:id/review puis recharge', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    vi.mocked(api.patch).mockResolvedValue(undefined);
    const { result } = renderHook(() => useContestations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.handleReview('c1'); });

    expect(api.patch).toHaveBeenCalledWith('/contestations/c1/review');
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
