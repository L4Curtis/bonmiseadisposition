import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BonDetailData } from '../../../detail/types';
import { useBonDetailCollaborateur } from '../useBonDetailCollaborateur';

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
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const bonFixture: BonDetailData = {
  id: 'b1',
  reference: 'BDM-2026-001',
  status: 'active',
  civilite: 'mr',
  dateMiseDisposition: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  collaborateur: { id: 'c1', displayName: 'Jean Dupont', email: 'jean@livio.fr' },
  collaborateurEmail: 'jean@livio.fr',
  filiale: { id: 'f1', name: 'siege', displayName: 'Siège' },
  createdBy: { id: 'u1', displayName: 'Admin', email: 'admin@livio.fr' },
  equipments: [],
  signatures: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useBonDetailCollaborateur', () => {
  it('loads the bon and its PDF snapshots on mount', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/bons/b1') return Promise.resolve(bonFixture);
      if (path === '/bons/b1/pdf-snapshots') {
        return Promise.resolve([{ type: 'signature_it_mise_disposition', filename: 'a.pdf', createdAt: '2026-01-01' }]);
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bon).toEqual(bonFixture);
    await waitFor(() => expect(result.current.pdfSnapshots).toHaveLength(1));
  });

  it('sets loadError when the bon fetch fails, and treats missing snapshots as an empty list', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Bon introuvable'));

    const { result } = renderHook(() => useBonDetailCollaborateur('missing'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe('Bon introuvable');
    expect(result.current.bon).toBeNull();
  });

  it('downloadPdf triggers a blob download and clears pdfLoading afterwards', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/bons/b1') return Promise.resolve(bonFixture);
      return Promise.resolve([]);
    });
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['pdf']));
    const createSpy = vi.fn(() => 'blob:fake-url');
    const revokeSpy = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createSpy;
    URL.revokeObjectURL = revokeSpy;

    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.bon).not.toBeNull());

    await act(async () => {
      await result.current.downloadPdf('mise_disposition');
    });

    expect(api.getBlob).toHaveBeenCalledWith('/bons/b1/pdf?type=mise_disposition');
    expect(result.current.pdfLoading).toBeNull();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('downloadPdf shows an error toast when the blob fetch fails', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/bons/b1') return Promise.resolve(bonFixture);
      return Promise.resolve([]);
    });
    vi.mocked(api.getBlob).mockRejectedValue(new Error('Impossible de télécharger le PDF'));

    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.bon).not.toBeNull());

    await act(async () => {
      await result.current.downloadPdf('mise_disposition');
    });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erreur', variant: 'destructive' }));
  });
});
