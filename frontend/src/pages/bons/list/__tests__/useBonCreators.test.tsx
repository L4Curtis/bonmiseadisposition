import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBonCreators } from '../useBonCreators';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';

describe('useBonCreators — filtre « Créé par »', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lit la liste réduite des comptes IT (ouverte au technicien), pas la liste de gestion des utilisateurs', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 't1', displayName: 'Zoé Technicienne' },
      { id: 'a1', displayName: 'Alain Admin' },
    ]);

    const { result } = renderHook(() => useBonCreators());

    await waitFor(() => expect(result.current).toHaveLength(2));
    const paths = vi.mocked(api.get).mock.calls.map(([path]) => path);
    expect(paths).toEqual(['/users/it-staff']);
    expect(result.current).toEqual([
      { id: 'a1', displayName: 'Alain Admin' },
      { id: 't1', displayName: 'Zoé Technicienne' },
    ]);
  });

  it('laisse la liste vide si le chargement échoue', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Droits insuffisants pour cette action'));

    const { result } = renderHook(() => useBonCreators());

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
