import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useConfigHealth, refreshConfigHealth, resetConfigHealthForTests } from '../use-config-health';

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

const sections = [
  { key: 'general', label: 'Général', state: 'configure' as const, detail: '', updatedAt: null },
];

beforeEach(() => {
  vi.resetAllMocks();
  resetConfigHealthForTests();
});

describe('useConfigHealth', () => {
  it('ne déclenche qu\'un seul appel réseau quand deux composants sont montés en même temps', async () => {
    vi.mocked(api.get).mockResolvedValue({ sections });

    // Deux instances simultanées : la carte de synthèse et les pastilles du
    // menu, montées ensemble sur la page « Général ».
    const { result: card } = renderHook(() => useConfigHealth());
    const { result: menu } = renderHook(() => useConfigHealth());

    await waitFor(() => expect(card.current.sections).toEqual(sections));
    await waitFor(() => expect(menu.current.sections).toEqual(sections));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('un reload déclenché par un composant met aussi à jour les autres composants montés', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ sections });

    const { result: card } = renderHook(() => useConfigHealth());
    const { result: menu } = renderHook(() => useConfigHealth());

    await waitFor(() => expect(card.current.sections).toEqual(sections));

    const updatedSections = [
      { key: 'general', label: 'Général', state: 'incomplet' as const, detail: 'maj', updatedAt: null },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ sections: updatedSections });

    act(() => { card.current.reload(); });

    await waitFor(() => expect(menu.current.sections).toEqual(updatedSections));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('refreshConfigHealth (appelé hors composant, ex. après un enregistrement) met à jour les composants déjà montés', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ sections });
    const { result: menu } = renderHook(() => useConfigHealth());
    await waitFor(() => expect(menu.current.sections).toEqual(sections));

    const updatedSections = [
      { key: 'general', label: 'Général', state: 'non_configure' as const, detail: 'maj', updatedAt: null },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ sections: updatedSections });

    act(() => { refreshConfigHealth(); });

    await waitFor(() => expect(menu.current.sections).toEqual(updatedSections));
  });

  it("n'appelle pas l'API quand enabled=false", () => {
    const { result } = renderHook(() => useConfigHealth(false));

    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.sections).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('conserve la dernière liste connue et expose une erreur en cas d\'échec', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Erreur réseau'));

    const { result } = renderHook(() => useConfigHealth());

    await waitFor(() => expect(result.current.error).toBe('Erreur réseau'));
    expect(result.current.sections).toBeNull();
  });
});
