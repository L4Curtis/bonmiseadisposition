import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { ContestationListItem } from '@/contracts/contestations';
import { useContestations } from '../useContestations';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), patch: vi.fn() } };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const contestation = {
  id: 'c1',
  message: 'Écran cassé à réception',
  status: 'open',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  bon: { id: 'b1', reference: 'BON-2026-0001', status: 'contested', filiale: { displayName: 'Paris' } },
  user: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com' },
} as ContestationListItem;

function response(overrides: Record<string, unknown> = {}) {
  return {
    contestations: [contestation],
    total: 1,
    page: 1,
    limit: 25,
    openCount: 1,
    pendingCount: 1,
    overdueCount: 0,
    overdueAfterDays: 7,
    overdueSince: '2026-09-16T07:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

/** Le hook dans un routeur ouvert sur `url`, avec l'adresse courante lisible. */
function renderAt(url = '/admin/contestations') {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, { initialEntries: [url] }, children);
  return renderHook(() => ({ list: useContestations(), location: useLocation() }), { wrapper });
}

describe('useContestations', () => {
  it('ouvre sur « À traiter » avec le prédicat de la tuile de l’accueil (aTraiter=1)', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderAt();
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.filter).toBe('pending');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('aTraiter=1'));
    expect(api.get).toHaveBeenCalledWith(expect.not.stringContaining('status='));
    expect(result.current.list.data?.pendingCount).toBe(1);
  });

  it('lien de la tuile (?aTraiter=1) : « À traiter », même requête que la tuile', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderAt('/admin/contestations?aTraiter=1');
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.filter).toBe('pending');
    expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('aTraiter=1'));
  });

  it('le filtre vit dans l’adresse : lien partagé, retour arrière', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderAt('/admin/contestations?filtre=non-retenues');
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.filter).toBe('not_retained');
    expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('status=rejected'));
  });

  it('changer de filtre revient à la page 1, l’écrit dans l’adresse ; « Toutes » n’envoie aucun filtre', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    const { result } = renderAt('/admin/contestations?aTraiter=1');
    await waitFor(() => expect(result.current.list.loading).toBe(false));

    act(() => result.current.list.setPage(2));
    act(() => result.current.list.setFilter('founded'));
    expect(result.current.list.page).toBe(1);
    expect(result.current.location.search).toBe('?filtre=fondees');
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('status=resolved')));

    act(() => result.current.list.setFilter('all'));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(expect.not.stringMatching(/status=|aTraiter=/)));

    act(() => result.current.list.setFilter('pending'));
    expect(result.current.location.search).toBe('');
  });

  it('une panne n’est pas une liste vide', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    const { result } = renderAt();
    await waitFor(() => expect(result.current.list.loadError).toBe('boom'));
    expect(result.current.list.data).toBeNull();
  });

  it('prise en charge : PATCH, message de confirmation, puis rechargement', async () => {
    vi.mocked(api.get).mockResolvedValue(response());
    vi.mocked(api.patch).mockResolvedValue(undefined);
    const { result } = renderAt();
    await waitFor(() => expect(result.current.list.loading).toBe(false));

    await act(async () => {
      await result.current.list.handleReview(contestation);
    });

    expect(api.patch).toHaveBeenCalledWith('/contestations/c1/review');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contestation prise en charge' }));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.current.list.reviewingId).toBeNull();
  });
});
