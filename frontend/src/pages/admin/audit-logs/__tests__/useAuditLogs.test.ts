import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuditLogs } from '../useAuditLogs';

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
      getFile: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

const log = {
  id: 'l1',
  action: 'bon_created',
  userEmail: 'jean@example.com',
  createdAt: '2026-09-01T10:00:00.000Z',
};

function mockApiGet(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/audit/actions')) return Promise.resolve(overrides.actions ?? ['bon_created']);
    if (path.startsWith('/audit')) return Promise.resolve(overrides.audit ?? { logs: [log], total: 1, page: 1, limit: 50 });
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useAuditLogs', () => {
  it('charge les logs et les actions disponibles au montage', async () => {
    mockApiGet();
    const { result } = renderHook(() => useAuditLogs());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.logs).toHaveLength(1);
    expect(result.current.availableActions).toEqual(['bon_created']);
  });

  it('applySearch envoie le filtre utilisateur et remet la page à 1', async () => {
    mockApiGet();
    const { result } = renderHook(() => useAuditLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setUserInput(' jean@example.com '));
    act(() => result.current.applySearch());

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('user=jean%40example.com')));
    expect(result.current.page).toBe(1);
  });

  it('setAction remet la page à 1 et relance avec le filtre action', async () => {
    mockApiGet();
    const { result } = renderHook(() => useAuditLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setAction('bon_created'));

    expect(result.current.page).toBe(1);
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('action=bon_created')));
  });

  it('resetFilters vide tous les filtres et remet la page à 1', async () => {
    mockApiGet();
    const { result } = renderHook(() => useAuditLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setUserInput('x'); result.current.setAction('bon_created'); result.current.setDateFrom('2026-01-01'); });
    act(() => result.current.resetFilters());

    expect(result.current.userInput).toBe('');
    expect(result.current.action).toBe('');
    expect(result.current.dateFrom).toBe('');
    expect(result.current.page).toBe(1);
  });

  it("exporte en CSV avec les filtres appliqués (pas la page)", async () => {
    mockApiGet();
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a,b'], { type: 'text/csv' }), filename: 'export.csv', truncated: false });
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useAuditLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setUserInput('Jean'); result.current.setDateFrom('2026-09-01'); });
    act(() => result.current.applySearch());
    act(() => result.current.setPage(3));
    await act(async () => { await result.current.exportCsv(); });

    expect(api.getFile).toHaveBeenCalledWith('/audit/export?user=Jean&dateFrom=2026-09-01');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    // Le fichier porte le nom annoncé par le serveur, pas un nom reconstruit.
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('export.csv');
    click.mockRestore();
    expect(result.current.exporting).toBe(false);
  });

  it('signale une erreur de chargement', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/audit/actions')) return Promise.resolve([]);
      if (path.startsWith('/audit')) return Promise.reject(new Error('boom'));
      return Promise.resolve(null);
    });
    const { result } = renderHook(() => useAuditLogs());

    await waitFor(() => expect(result.current.loadError).toBe('boom'));
  });
});
