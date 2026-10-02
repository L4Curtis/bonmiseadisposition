import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { useBonsListParams } from '../useBonsListParams';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE, WAITING_ALL_STATUS } from '../statusFilterOptions';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  const { listViaGet } = await import('@/test/api-mock');
  const get = vi.fn();
  return {
    ...actual,
    api: {
      get, getList: listViaGet(get),
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
  window.localStorage.clear();
  resetActiveFilialesForTests();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    if (path.startsWith('/bons?')) return Promise.resolve({ items: [], total: 0, page: 1, limit: 25, truncated: false });
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

  it('trie via toggleSort, revient à la page 1 et transmet sort/order à l’API', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(3));
    act(() => result.current.toggleSort('reference'));

    expect(result.current.query.sort).toBe('reference');
    expect(result.current.query.order).toBe('asc');
    expect(result.current.page).toBe(1);
    await waitFor(() => expect(lastListCall()).toContain('sort=reference&order=asc'));

    act(() => result.current.toggleSort('reference'));
    expect(result.current.query.order).toBe('desc');
  });

  it('transmet période, « sans date de restitution » et créateur à l’API', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFilters({ dateFrom: '2026-01-01', dateTo: '2026-03-31', noReturnDate: true, createdById: 'u1' }));

    await waitFor(() => {
      const call = lastListCall() ?? '';
      expect(call).toContain('dateFrom=2026-01-01');
      expect(call).toContain('dateTo=2026-03-31');
      expect(call).toContain('noReturnDate=1');
      expect(call).toContain('createdById=u1');
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('mémorise filtres et tri, et les restaure à l’ouverture sans paramètre d’URL', async () => {
    const first = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => first.result.current.handleStatusSelect('draft'));
    act(() => first.result.current.toggleSort('collaborateur'));
    first.unmount();

    const second = renderHook(() => useBonsListParams(), { wrapper });
    expect(second.result.current.statusFilter).toBe('draft');
    expect(second.result.current.query.sort).toBe('collaborateur');
  });

  it('un lien avec paramètres (tableau de bord) l’emporte sur les filtres mémorisés', async () => {
    window.localStorage.setItem('bons-list:last-query:v1', 'status=draft');
    const linkWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/bons?overdue=1']}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useBonsListParams(), { wrapper: linkWrapper });

    expect(result.current.overdue).toBe(true);
    expect(result.current.statusFilter).toBe('');
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('resetFilters conserve le tri choisi', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.toggleSort('status');
      result.current.setOverdue(true);
    });
    act(() => result.current.resetFilters());

    expect(result.current.overdue).toBe(false);
    expect(result.current.query.sort).toBe('status');
  });
});

function lastListCall(): string | undefined {
  const calls = vi.mocked(api.get).mock.calls.filter(([p]) => p.startsWith('/bons?'));
  return calls[calls.length - 1]?.[0];
}

describe('useBonsListParams — nombre de lignes par page', () => {
  it('25 par défaut ; 50 choisi : mémorisé, envoyé à l’API, retour à la page 1', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(lastListCall()).toContain('limit=25');

    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));

    await waitFor(() => expect(lastListCall()).toContain('limit=50'));
    expect(lastListCall()).toContain('page=1');
    expect(window.localStorage.getItem('bons-it:lignes-par-page')).toBe('50');
  });

  it('reprend le choix mémorisé à l’ouverture', async () => {
    window.localStorage.setItem('bons-it:lignes-par-page', '100');
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pageSize).toBe(100);
    expect(lastListCall()).toContain('limit=100');
  });
});

/** Adresse courante de la liste, lue par un composant témoin placé dans le routeur. */
function routerWrapper(initialEntry: string, onLocation: (search: string) => void) {
  function LocationProbe() {
    const location = useLocation();
    onLocation(location.search);
    return null;
  }
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      {children}
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('useBonsListParams — filtre invalide dans l’adresse ou la mémoire', () => {
  it('ignore une date impossible : la liste se charge, un message la signale, l’adresse et la mémoire sont nettoyées', async () => {
    let search = '';
    const { result } = renderHook(() => useBonsListParams(), {
      wrapper: routerWrapper('/bons?dateFrom=2026-13-45&status=draft', (s) => { search = s; }),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBeNull();
    expect(lastListCall()).not.toContain('dateFrom');
    expect(lastListCall()).toContain('status=draft');
    expect(result.current.notice).toBe(
      'Un filtre n’était pas valide et a été ignoré : date de début de mise à disposition.',
    );
    await waitFor(() => expect(search).toBe('?status=draft'));
    expect(window.localStorage.getItem('bons-list:last-query:v1')).toBe('status=draft');
  });

  it('un filtre invalide déjà mémorisé est ignoré, signalé, puis effacé de la mémoire', async () => {
    window.localStorage.setItem('bons-list:last-query:v1', 'dateFrom=2026-13-45&overdue=1');
    const { result } = renderHook(() => useBonsListParams(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBeNull();
    expect(result.current.overdue).toBe(true);
    expect(result.current.notice).toContain('date de début de mise à disposition');
    expect(window.localStorage.getItem('bons-list:last-query:v1')).toBe('overdue=1');
  });

  it('le message se ferme', async () => {
    const { result } = renderHook(() => useBonsListParams(), {
      wrapper: routerWrapper('/bons?dateTo=2026-02-30', () => undefined),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.dismissNotice());

    expect(result.current.notice).toBeNull();
  });

  it('une période inversée saisie à l’écran ne bloque pas la liste : signalée près du champ, non transmise ni mémorisée', async () => {
    const { result } = renderHook(() => useBonsListParams(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFilters({ dateFrom: '2026-05-01', dateTo: '2026-04-01', overdue: true }));

    await waitFor(() => expect(lastListCall()).toContain('overdue=1'));
    expect(lastListCall()).not.toContain('dateFrom');
    expect(result.current.loadError).toBeNull();
    expect(result.current.query.dateFrom).toBe('2026-05-01');
    expect(result.current.dateRangeError).toBe(
      'La date de début doit précéder la date de fin : la période n’est pas appliquée.',
    );
    expect(window.localStorage.getItem('bons-list:last-query:v1')).toBe('overdue=1');
  });
});
