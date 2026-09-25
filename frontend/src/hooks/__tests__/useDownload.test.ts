import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, getFile: vi.fn() } };
});
vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api, ApiError, type DownloadedFile } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { toast } from '@/hooks/use-toast';
import { useDownload } from '../useDownload';

function file(overrides: Partial<DownloadedFile> = {}): DownloadedFile {
  return { blob: new Blob(['a;b']), filename: 'inventaire-2026-09-24.csv', truncated: false, ...overrides };
}

const SUCCESS = { title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.' };

const REQUEST = {
  path: '/reporting/inventory/export',
  fallbackFilename: 'inventaire.csv',
  errorMessage: "Erreur lors de l'export CSV.",
};

beforeEach(() => {
  vi.mocked(api.getFile).mockReset();
  vi.mocked(saveBlob).mockReset();
  vi.mocked(toast).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDownload', () => {
  it('enregistre le fichier sous le nom donné par le serveur', async () => {
    const received = file();
    vi.mocked(api.getFile).mockResolvedValue(received);
    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.download(REQUEST);
    });

    expect(api.getFile).toHaveBeenCalledWith('/reporting/inventory/export');
    expect(saveBlob).toHaveBeenCalledWith(received.blob, 'inventaire-2026-09-24.csv');
  });

  it('prend le nom de secours quand le serveur n’en annonce pas', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file({ filename: null }));
    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.download(REQUEST);
    });

    expect(saveBlob).toHaveBeenCalledWith(expect.anything(), 'inventaire.csv');
  });

  it('prévient, sans disparaître seul, quand le fichier a été coupé', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file({ truncated: true }));
    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.download({ ...REQUEST, success: SUCCESS });
    });

    expect(result.current.truncated).toBe(true);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Export incomplet',
      duration: Infinity,
    }));
  });

  it('confirme le succès quand un message est fourni', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file());
    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.download({ ...REQUEST, success: SUCCESS });
    });

    expect(toast).toHaveBeenCalledWith({ ...SUCCESS, variant: 'success' });
    expect(result.current.truncated).toBe(false);
  });

  it('reste discret sans message de succès (modèle d’import, PDF)', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file());
    const { result } = renderHook(() => useDownload());

    await act(async () => {
      await result.current.download(REQUEST);
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it('affiche l’erreur du serveur et renvoie null', async () => {
    vi.mocked(api.getFile).mockRejectedValue(new ApiError(403, 'Export réservé aux administrateurs'));
    const { result } = renderHook(() => useDownload());

    let returned: DownloadedFile | null = file();
    await act(async () => {
      returned = await result.current.download(REQUEST);
    });

    expect(returned).toBeNull();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Export réservé aux administrateurs',
      variant: 'destructive',
    }));
  });

  it('indique le téléchargement en cours', async () => {
    let resolve: (f: DownloadedFile) => void = () => {};
    vi.mocked(api.getFile).mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useDownload());

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.download(REQUEST);
    });
    expect(result.current.downloading).toBe(true);

    await act(async () => {
      resolve(file());
      await pending;
    });
    expect(result.current.downloading).toBe(false);
  });
});
