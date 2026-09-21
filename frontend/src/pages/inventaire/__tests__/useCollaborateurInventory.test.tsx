import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCollaborateurInventory } from '../useCollaborateurInventory';
import type { InventoryBaseFilters } from '../inventoryFilterParams';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';

const EMPTY_FILTERS: InventoryBaseFilters = {
  filialeFilter: '', categoryFilter: '', situationFilter: '', search: '', overdueFilter: false,
};

const response = {
  items: [
    { collaborateurId: 'u1', displayName: 'Jean Dupont', email: 'jean@x.fr', department: 'IT', filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' }, active: true, count: 5, overdueCount: 1, oldestDateMiseDisposition: '2026-01-01T00:00:00.000Z', oldestAgeDays: 260 },
  ],
  total: 1,
  page: 1,
  limit: 50,
  truncated: false,
};

/** Petit harnais gérant lui-même `page`, comme le ferait useInventory (le hook
 *  testé ne possède pas son propre état de page — il le reçoit de l'appelant). */
function useHarness(enabled: boolean, filters: InventoryBaseFilters, compteFilter?: '' | 'actif' | 'inactif') {
  const [page, setPage] = useState(1);
  const collaborateurs = useCollaborateurInventory({ enabled, filters, page, setPage, compteFilter });
  return { ...collaborateurs, page, setPage };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useCollaborateurInventory', () => {
  it('charge le regroupement par collaborateur au montage quand `enabled` est vrai', async () => {
    vi.mocked(api.get).mockResolvedValue(response);
    const { result } = renderHook(() => useHarness(true, EMPTY_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(response.items);
    expect(result.current.total).toBe(1);
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/reporting/inventory/by-collaborateur?'));
  });

  it("n'interroge pas l'API quand `enabled` est faux", async () => {
    vi.mocked(api.get).mockResolvedValue(response);
    renderHook(() => useHarness(false, EMPTY_FILTERS));

    await new Promise((r) => setTimeout(r, 10));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('transmet les filtres actifs (filiale, catégorie, situation, recherche, retard) à la requête', async () => {
    vi.mocked(api.get).mockResolvedValue(response);
    const filters: InventoryBaseFilters = {
      filialeFilter: 'f1', categoryFilter: 'ecran', situationFilter: 'en_circulation', search: 'dell', overdueFilter: true,
    };
    renderHook(() => useHarness(true, filters));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('filialeId=f1');
      expect(lastCall).toContain('category=ecran');
      expect(lastCall).toContain('situation=en_circulation');
      expect(lastCall).toContain('search=dell');
      expect(lastCall).toContain('overdue=1');
    });
  });

  it('ne transmet pas "sort" par défaut ("count"), mais l\'ajoute quand "oldest" est choisi et remet la page à 1', async () => {
    vi.mocked(api.get).mockResolvedValue(response);
    const { result } = renderHook(() => useHarness(true, EMPTY_FILTERS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let lastCall = vi.mocked(api.get).mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain('sort=');

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setSort('oldest'));
    await waitFor(() => expect(result.current.page).toBe(1));

    await waitFor(() => {
      lastCall = vi.mocked(api.get).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('sort=oldest');
      expect(lastCall).toContain('page=1');
    });
  });

  it('signale une erreur de chargement et retry() la relance', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom collaborateurs'));
    const { result } = renderHook(() => useHarness(true, EMPTY_FILTERS));

    await waitFor(() => expect(result.current.error).toBe('boom collaborateurs'));
    expect(result.current.items).toEqual([]);

    vi.mocked(api.get).mockResolvedValue(response);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });

  it('transmet le filtre compte (lot D1) quand il est actif, absent par défaut', async () => {
    vi.mocked(api.get).mockResolvedValue(response);
    renderHook(() => useHarness(true, EMPTY_FILTERS));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('compte=');
    });

    vi.mocked(api.get).mockClear();
    renderHook(() => useHarness(true, EMPTY_FILTERS, 'inactif'));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('compte=inactif');
    });
  });

  it('remonte la troncature du serveur pour que la vue puisse avertir', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...response, truncated: true });
    const { result } = renderHook(() => useHarness(true, EMPTY_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.truncated).toBe(true);
  });
});
