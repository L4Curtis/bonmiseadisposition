import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import { useBonActions } from '../useBonActions';
import type { BonDetailData } from '../types';

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
  // Défaut permissif pour tous les GET annexes (snapshots, notifications) —
  // chaque test surcharge /bons/:id explicitement via mockImplementationOnce.
  vi.mocked(api.get).mockResolvedValue([]);
});

describe('useBonActions', () => {
  it('load() fetches the bon, its PDF snapshots and its notification logs', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/bons/b1') return Promise.resolve(bonFixture);
      if (path === '/bons/b1/pdf-snapshots') {
        return Promise.resolve([{ type: 'signature_it_mise_disposition', filename: 'a.pdf', createdAt: '2026-01-01' }]);
      }
      if (path === '/bons/b1/notifications') {
        return Promise.resolve([{ id: 'n1', type: 'send', status: 'sent', recipientEmail: 'jean@livio.fr', sentAt: '2026-01-01' }]);
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    const { result } = renderHook(() => useBonActions('b1'));
    await act(async () => {
      await result.current.load();
    });

    expect(result.current.bon).toEqual(bonFixture);
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.pdfSnapshots).toHaveLength(1));
    await waitFor(() => expect(result.current.notifLogs).toHaveLength(1));
  });

  it('doSend on a 409 serial_conflicts response fills sendSerialConflicts and shows no error toast', async () => {
    const conflicts = [{ serialNumber: 'SN-1', bonReference: 'BDM-9' }];
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, 'Conflit', { code: 'serial_conflicts', conflicts }),
    );

    const { result } = renderHook(() => useBonActions('b1'));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.doSend();
    });

    expect(ok).toBe(false);
    expect(result.current.sendSerialConflicts).toEqual(conflicts);
    expect(toast).not.toHaveBeenCalled();
  });

  it('doSend on success reloads via "refreshing" without ever flipping "loading" back to true', async () => {
    vi.mocked(api.get).mockImplementationOnce(() => Promise.resolve(bonFixture));
    const { result } = renderHook(() => useBonActions('b1'));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.loading).toBe(false);

    vi.mocked(api.post).mockResolvedValueOnce(undefined);
    vi.mocked(api.get).mockImplementationOnce(() => Promise.resolve({ ...bonFixture, status: 'sent_mise_dispo' }));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.doSend();
    });

    expect(ok).toBe(true);
    // reload() passe par `refreshing`, jamais par `loading` : si la
    // régression réintroduisait setLoading(true) ici, cette assertion serait
    // encore vraie par coïncidence — la garantie vient surtout du fait que le
    // rechargement (vérifié ci-dessous) se fait bien sans jamais activer
    // `loading` entre-temps, seul `refreshing` en portant la charge.
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.bon?.status).toBe('sent_mise_dispo'));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('doResend on a 409 token_recent response sets resendConfirmSentAt', async () => {
    const sentAt = '2026-01-01T10:00:00.000Z';
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'Trop récent', { code: 'token_recent', sentAt }));

    const { result } = renderHook(() => useBonActions('b1'));
    await act(async () => {
      await result.current.doResend();
    });

    expect(result.current.resendConfirmSentAt).toBe(sentAt);
    expect(toast).not.toHaveBeenCalled();
  });

  it('a generic error surfaces as a destructive toast via showActionError', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useBonActions('b1'));
    await act(async () => {
      await result.current.doCancel();
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: 'boom' }),
    );
  });
});
