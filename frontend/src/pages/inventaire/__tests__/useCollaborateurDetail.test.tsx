import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCollaborateurDetail } from '../useCollaborateurDetail';
import type { InventoryBaseFilters } from '../inventoryFilterParams';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';

const EMPTY_FILTERS: InventoryBaseFilters = {
  filialeFilter: '', categoryFilter: '', situationFilter: '', search: '', overdueFilter: false,
};

const listResponse = {
  items: [{ equipmentId: 'e1', label: 'Latitude 5540' }],
  total: 1,
  page: 1,
  limit: 200,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useCollaborateurDetail', () => {
  it("charge le détail d'un collaborateur au premier dépliage, filtré par collaborateurId", async () => {
    vi.mocked(api.get).mockResolvedValue(listResponse);
    const { result } = renderHook(() => useCollaborateurDetail(EMPTY_FILTERS));

    expect(result.current.expandedIds.has('u1')).toBe(false);

    act(() => result.current.toggle('u1'));

    expect(result.current.expandedIds.has('u1')).toBe(true);
    expect(result.current.detailFor('u1').loading).toBe(true);

    await waitFor(() => expect(result.current.detailFor('u1').loading).toBe(false));
    expect(result.current.detailFor('u1').items).toEqual(listResponse.items);

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string];
    expect(calledUrl).toContain('/reporting/inventory?');
    expect(calledUrl).toContain('collaborateurId=u1');
  });

  it('un second dépliage replie la ligne sans relancer de requête (résultat mis en cache)', async () => {
    vi.mocked(api.get).mockResolvedValue(listResponse);
    const { result } = renderHook(() => useCollaborateurDetail(EMPTY_FILTERS));

    act(() => result.current.toggle('u1'));
    await waitFor(() => expect(result.current.detailFor('u1').loading).toBe(false));

    act(() => result.current.toggle('u1'));
    expect(result.current.expandedIds.has('u1')).toBe(false);

    act(() => result.current.toggle('u1'));
    expect(result.current.expandedIds.has('u1')).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('plusieurs lignes peuvent être dépliées simultanément', async () => {
    vi.mocked(api.get).mockResolvedValue(listResponse);
    const { result } = renderHook(() => useCollaborateurDetail(EMPTY_FILTERS));

    act(() => result.current.toggle('u1'));
    act(() => result.current.toggle('u2'));

    expect(result.current.expandedIds.has('u1')).toBe(true);
    expect(result.current.expandedIds.has('u2')).toBe(true);
  });

  it('signale une erreur de chargement du détail et retryDetail() la relance', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom détail'));
    const { result } = renderHook(() => useCollaborateurDetail(EMPTY_FILTERS));

    act(() => result.current.toggle('u1'));
    await waitFor(() => expect(result.current.detailFor('u1').error).toBe('boom détail'));

    vi.mocked(api.get).mockResolvedValue(listResponse);
    act(() => result.current.retryDetail('u1'));

    await waitFor(() => expect(result.current.detailFor('u1').error).toBeNull());
    await waitFor(() => expect(result.current.detailFor('u1').items).toEqual(listResponse.items));
  });

  it('un changement de filtre replie tout et invalide le détail déjà chargé', async () => {
    vi.mocked(api.get).mockResolvedValue(listResponse);
    const { result, rerender } = renderHook(({ filters }) => useCollaborateurDetail(filters), {
      initialProps: { filters: EMPTY_FILTERS },
    });

    act(() => result.current.toggle('u1'));
    await waitFor(() => expect(result.current.detailFor('u1').loading).toBe(false));

    rerender({ filters: { ...EMPTY_FILTERS, filialeFilter: 'f1' } });

    expect(result.current.expandedIds.has('u1')).toBe(false);
    expect(result.current.detailFor('u1')).toEqual({ items: [], loading: false, error: null });
  });
});
