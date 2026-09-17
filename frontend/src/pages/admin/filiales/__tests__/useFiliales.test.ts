import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFiliales } from '../useFiliales';

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

const filiale = {
  id: 'f1',
  name: 'Fresse GDO',
  displayName: 'Fresse GDO SAS',
  active: true,
  address: null,
  siret: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue([filiale]);
});

describe('useFiliales', () => {
  it('charge la liste des filiales au montage', async () => {
    const { result } = renderHook(() => useFiliales());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filiales).toEqual([filiale]);
    expect(result.current.loadError).toBeNull();
  });

  it('signale une erreur de chargement', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useFiliales());

    await waitFor(() => expect(result.current.loadError).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });

  it('create() envoie POST /filiales, ferme le formulaire et recharge la liste', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFiliales());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setCreating(true));

    let ok = false;
    await act(async () => { ok = await result.current.create({ name: 'Nouvelle', displayName: 'Nouvelle SAS' }); });

    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/filiales', { name: 'Nouvelle', displayName: 'Nouvelle SAS' });
    expect(result.current.creating).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('create() retourne false et garde le formulaire ouvert en cas d’erreur', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('validation'));
    const { result } = renderHook(() => useFiliales());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setCreating(true));

    let ok = true;
    await act(async () => { ok = await result.current.create({ name: '' }); });

    expect(ok).toBe(false);
    expect(result.current.creating).toBe(true);
  });

  it('update() envoie PUT /filiales/:id et ferme l’édition', async () => {
    vi.mocked(api.put).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFiliales());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setEditingId('f1'));

    await act(async () => { await result.current.update('f1', { active: false }); });

    expect(api.put).toHaveBeenCalledWith('/filiales/f1', { active: false });
    expect(result.current.editingId).toBeNull();
  });

  it('remove() envoie DELETE puis recharge et réinitialise la cible', async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFiliales());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setDeleteTarget(filiale));

    await act(async () => { await result.current.remove(); });

    expect(api.delete).toHaveBeenCalledWith('/filiales/f1');
    expect(result.current.deleteTarget).toBeNull();
  });

  it('uploadFile() envoie un PATCH multipart vers /filiales/:id/logo', async () => {
    vi.mocked(api.patchForm).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFiliales());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await act(async () => { await result.current.uploadFile('f1', 'logo', file); });

    expect(api.patchForm).toHaveBeenCalledWith('/filiales/f1/logo', expect.any(FormData));
  });
});
