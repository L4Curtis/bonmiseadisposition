import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBonsListParams } from '../useBonsListParams';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE, WAITING_ALL_STATUS } from '../statusFilterOptions';
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

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/bons']}>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    if (path.startsWith('/bons?')) return Promise.resolve({ bons: [], total: 0 });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

describe('useBonsListParams', () => {
  it('sélectionner le filtre composite "En cours" pilote excludeStatus (pas status)', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleStatusSelect(IN_PROGRESS_OPTION_VALUE));

    expect(result.current.statusSelectValue).toBe(IN_PROGRESS_OPTION_VALUE);
    await waitFor(() => {
      const calls = vi.mocked(api.get).mock.calls.filter(([p]) => p.startsWith('/bons?'));
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[0]).toContain(`excludeStatus=${encodeURIComponent(IN_PROGRESS_EXCLUDE)}`);
    });
  });

  it('sélectionner un statut explicite retire le filtre "En cours" hérité', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.handleStatusSelect(IN_PROGRESS_OPTION_VALUE));
    await waitFor(() => expect(result.current.statusSelectValue).toBe(IN_PROGRESS_OPTION_VALUE));

    act(() => result.current.handleStatusSelect(WAITING_ALL_STATUS));

    expect(result.current.statusSelectValue).toBe(WAITING_ALL_STATUS);
    expect(result.current.excludeStatus).toBe('');
  });

  it('resetFilters efface tous les filtres actifs et revient à la page 1', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSearchInput('jean');
      result.current.setSearch('jean');
      result.current.setFilialeFilter('f1');
      result.current.setOverdue(true);
      result.current.setPage(2);
    });
    await waitFor(() => expect(result.current.hasActiveFilters).toBe(true));

    act(() => result.current.resetFilters());

    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.page).toBe(1);
  });
});
