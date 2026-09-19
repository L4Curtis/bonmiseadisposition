import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useInventory } from '../useInventory';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';

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

const summary = {
  total: 10,
  byCategory: [{ category: 'pc_portable', label: 'PC portable', count: 6 }],
  byFiliale: [{ filialeId: 'f1', name: 'Paris', count: 10 }],
  overdue: 2,
};

const listResponse = {
  items: [
    {
      equipmentId: 'e1',
      label: 'Latitude 5540',
      category: 'pc_portable',
      serialNumber: 'SN1',
      inventoryNumber: null,
      bonId: 'b1',
      bonReference: 'BMD-2026-0001',
      bonStatus: 'active',
      dateMiseDisposition: '2026-08-01T00:00:00.000Z',
      dateRestitution: null,
      collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com', department: null },
      filiale: { id: 'f1', name: 'Paris', displayName: 'Paris' },
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/inventaire']}>{children}</MemoryRouter>;
}

function mockApiGet(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/reporting/inventory/summary')) return Promise.resolve(overrides.summary ?? summary);
    if (path.startsWith('/reporting/inventory')) return Promise.resolve(overrides.list ?? listResponse);
    if (path.startsWith('/filiales/active')) return Promise.resolve(overrides.filiales ?? []);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

describe('useInventory', () => {
  it('charge le résumé et la liste au montage', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toEqual(summary);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it('remet la page à 1 et transmet filialeId au filtre par filiale', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setFilialeFilter('f1'));

    await waitFor(() => expect(result.current.page).toBe(1));
    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory?'))
        .at(-1);
      expect(lastCall).toContain('filialeId=f1');
      expect(lastCall).toContain('page=1');
    });
  });

  it('signale une erreur de résumé et loadSummary() la relance', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/reporting/inventory/summary')) return Promise.reject(new Error('boom résumé'));
      if (path.startsWith('/reporting/inventory')) return Promise.resolve(listResponse);
      return Promise.resolve([]);
    });
    const { result } = renderHook(() => useInventory(), { wrapper });

    await waitFor(() => expect(result.current.summaryError).toBe('boom résumé'));
    expect(result.current.summary).toBeNull();

    mockApiGet();
    act(() => result.current.loadSummary());
    await waitFor(() => expect(result.current.summaryError).toBeNull());
    await waitFor(() => expect(result.current.summary).toEqual(summary));
  });

  it("signale une erreur de chargement de la liste et retry() la relance", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/reporting/inventory/summary')) return Promise.resolve(summary);
      if (path.startsWith('/reporting/inventory')) return Promise.reject(new Error('boom liste'));
      return Promise.resolve([]);
    });
    const { result } = renderHook(() => useInventory(), { wrapper });

    await waitFor(() => expect(result.current.loadError).toBe('boom liste'));
    expect(result.current.items).toEqual([]);

    mockApiGet();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loadError).toBeNull());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
  });

  it('resetFilters vide les filtres, la recherche, le tri retard et remet la page à 1', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setFilialeFilter('f1'); result.current.setCategoryFilter('pc_portable'); });
    act(() => result.current.setOverdueFilter(true));
    await waitFor(() => expect(result.current.filialeFilter).toBe('f1'));

    act(() => result.current.resetFilters());

    expect(result.current.filialeFilter).toBe('');
    expect(result.current.categoryFilter).toBe('');
    expect(result.current.searchInput).toBe('');
    expect(result.current.overdueFilter).toBe(false);
    expect(result.current.page).toBe(1);
  });

  it('toggleDateSort bascule asc/desc, transmet sort/direction à l’API et remet la page à 1', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.toggleDateSort());
    await waitFor(() => expect(result.current.sortDirection).toBe('asc'));
    expect(result.current.page).toBe(1);

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory?'))
        .at(-1);
      expect(lastCall).toContain('sort=dateMiseDisposition');
      expect(lastCall).toContain('direction=asc');
    });

    act(() => result.current.toggleDateSort());
    await waitFor(() => expect(result.current.sortDirection).toBe('desc'));
  });

  it('setOverdueFilter transmet overdue=1 à l’API et le persiste dans l’URL', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setOverdueFilter(true));

    await waitFor(() => {
      const lastCall = vi.mocked(api.get).mock.calls
        .map(([path]) => path as string)
        .filter((p) => p.startsWith('/reporting/inventory?'))
        .at(-1);
      expect(lastCall).toContain('overdue=1');
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('handleExport télécharge le CSV avec les filtres actifs', async () => {
    mockApiGet();
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setFilialeFilter('f1'));
    await waitFor(() => expect(result.current.filialeFilter).toBe('f1'));

    await act(async () => { await result.current.handleExport(); });

    expect(api.getBlob).toHaveBeenCalledWith(expect.stringContaining('filialeId=f1'));
    expect(result.current.exportLoading).toBe(false);
  });

  it('handleExport reflète aussi le tri et le filtre "retards uniquement" actifs', async () => {
    mockApiGet();
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setOverdueFilter(true); result.current.toggleDateSort(); });
    await waitFor(() => expect(result.current.overdueFilter).toBe(true));

    await act(async () => { await result.current.handleExport(); });

    const [exportUrl] = vi.mocked(api.getBlob).mock.calls.at(-1) as [string];
    expect(exportUrl).toContain('overdue=1');
    expect(exportUrl).toContain('sort=dateMiseDisposition');
    expect(exportUrl).toContain('direction=asc');
  });

  it('démarre sur la vue "equipements" par défaut, absente de l\'URL', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.view).toBe('equipements');
  });

  it('lit la vue "collaborateurs" depuis l\'URL au montage (persistance au rechargement)', async () => {
    mockApiGet();
    function collabWrapper({ children }: { children: ReactNode }) {
      return <MemoryRouter initialEntries={['/inventaire?vue=collaborateurs']}>{children}</MemoryRouter>;
    }
    const { result } = renderHook(() => useInventory(), { wrapper: collabWrapper });

    expect(result.current.view).toBe('collaborateurs');
  });

  it('setView écrit "vue=collaborateurs" dans l\'URL, remet la page à 1 et arrête d\'interroger la liste par équipement', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    const callsBefore = vi.mocked(api.get).mock.calls.filter(([p]) => (p as string).startsWith('/reporting/inventory?')).length;

    act(() => result.current.setView('collaborateurs'));

    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.view).toBe('collaborateurs');

    await new Promise((r) => setTimeout(r, 10));
    const callsAfter = vi.mocked(api.get).mock.calls.filter(([p]) => (p as string).startsWith('/reporting/inventory?')).length;
    expect(callsAfter).toBe(callsBefore);
  });

  it('conserve les filtres actifs en changeant de vue', async () => {
    mockApiGet();
    const { result } = renderHook(() => useInventory(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setFilialeFilter('f1'));
    await waitFor(() => expect(result.current.filialeFilter).toBe('f1'));

    act(() => result.current.setView('collaborateurs'));

    expect(result.current.filialeFilter).toBe('f1');
    expect(result.current.baseFilters.filialeFilter).toBe('f1');
  });
});
