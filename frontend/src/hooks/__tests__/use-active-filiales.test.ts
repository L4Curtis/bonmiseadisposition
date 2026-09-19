import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useActiveFiliales,
  getActiveFiliales,
  invalidateActiveFiliales,
  resetActiveFilialesForTests,
} from '../use-active-filiales';

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

const filialeA = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };
const filialeB = { id: 'f2', name: 'annexe', displayName: 'Annexe', active: true };

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
});

describe('useActiveFiliales', () => {
  it("ne déclenche qu'un seul appel réseau quand deux composants sont montés en même temps", async () => {
    vi.mocked(api.get).mockResolvedValue([filialeA]);

    const { result: a } = renderHook(() => useActiveFiliales());
    const { result: b } = renderHook(() => useActiveFiliales());

    await waitFor(() => expect(a.current.filiales).toEqual([filialeA]));
    await waitFor(() => expect(b.current.filiales).toEqual([filialeA]));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('réutilise le cache 60 s au lieu de redemander la liste à chaque nouveau montage', async () => {
    // Contrôle du temps via Date.now (lu par le cache) plutôt que les timers
    // fake de vitest, pour ne pas interférer avec les microtasks de waitFor.
    const realNow = Date.now;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow());
    try {
      vi.mocked(api.get).mockResolvedValue([filialeA]);

      const { result: first, unmount } = renderHook(() => useActiveFiliales());
      await waitFor(() => expect(first.current.filiales).toEqual([filialeA]));
      unmount();

      // Bien avant l'expiration du cache (60 s) : un nouveau montage doit
      // réutiliser la valeur en cache sans nouvel appel réseau.
      nowSpy.mockReturnValue(realNow() + 30_000);
      const { result: second } = renderHook(() => useActiveFiliales());
      await waitFor(() => expect(second.current.filiales).toEqual([filialeA]));
      expect(api.get).toHaveBeenCalledTimes(1);

      // Passé les 60 s, un nouveau montage redemande la liste.
      nowSpy.mockReturnValue(realNow() + 61_000);
      vi.mocked(api.get).mockResolvedValue([filialeB]);
      const { result: third } = renderHook(() => useActiveFiliales());
      await waitFor(() => expect(third.current.filiales).toEqual([filialeB]));
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('invalidateActiveFiliales vide le cache et redemande la liste pour les composants déjà montés', async () => {
    vi.mocked(api.get).mockResolvedValueOnce([filialeA]);
    const { result } = renderHook(() => useActiveFiliales());
    await waitFor(() => expect(result.current.filiales).toEqual([filialeA]));

    vi.mocked(api.get).mockResolvedValueOnce([filialeA, filialeB]);
    act(() => { invalidateActiveFiliales(); });

    await waitFor(() => expect(result.current.filiales).toEqual([filialeA, filialeB]));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('conserve la dernière liste connue en cas d\'échec, et expose une erreur séparée', async () => {
    vi.mocked(api.get).mockResolvedValueOnce([filialeA]);
    const { result } = renderHook(() => useActiveFiliales());
    await waitFor(() => expect(result.current.filiales).toEqual([filialeA]));

    vi.mocked(api.get).mockRejectedValueOnce(new Error('Erreur réseau'));
    act(() => { result.current.reload(); });

    await waitFor(() => expect(result.current.error).toBe('Erreur réseau'));
    // « Avaler l'erreur » : la dernière liste connue reste affichée.
    expect(result.current.filiales).toEqual([filialeA]);
  });
});

describe('getActiveFiliales (appel ponctuel hors composant, ex. useBonCreateReferenceData)', () => {
  it('partage le même cache que useActiveFiliales', async () => {
    vi.mocked(api.get).mockResolvedValue([filialeA]);

    const direct = await getActiveFiliales();
    const { result } = renderHook(() => useActiveFiliales());

    await waitFor(() => expect(result.current.filiales).toEqual([filialeA]));
    expect(direct).toEqual([filialeA]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
