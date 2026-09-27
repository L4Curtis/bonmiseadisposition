import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { ApiError } from '@/lib/api';
import { useBonActions } from '../useBonActions';
import { bonFiche } from './fixtures';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), getBlob: vi.fn(), postForm: vi.fn(), patchForm: vi.fn() },
  };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);

function mockBon(bon = bonFiche()) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/bons/b1') return Promise.resolve(bon);
    return Promise.resolve([]);
  });
}

async function loaded(bon = bonFiche()) {
  mockBon(bon);
  const hook = renderHook(() => useBonActions('b1'), { wrapper });
  await act(async () => { await hook.result.current.load(); });
  return hook;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useBonActions — parcours pilotés par le serveur', () => {
  it('charge la fiche, ses documents et ses emails', async () => {
    const { result } = await loaded();
    expect(result.current.bon?.reference).toBe('BON-2026-0001');
    expect(result.current.loading).toBe(false);
  });

  it('envoyer : contrôles des numéros AVANT la signature IT ; un doute ouvre la fenêtre de contrôle', async () => {
    const draft = bonFiche({ status: 'draft' });
    const { result } = await loaded(draft);
    const checks = { missingSerials: [{ equipmentId: 'e1', position: 1, label: 'Écran' }], serialConflicts: [] };
    vi.mocked(api.get).mockResolvedValueOnce(checks);

    await act(async () => { result.current.run('send'); });

    await waitFor(() => expect(result.current.dialog).toEqual({ kind: 'send-checks', checks, channel: 'email' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('envoyer sans doute : la signature IT est demandée, puis l’envoi part avec les confirmations', async () => {
    const { result } = await loaded(bonFiche({ status: 'draft' }));
    vi.mocked(api.get).mockResolvedValueOnce({ missingSerials: [], serialConflicts: [] });
    await act(async () => { result.current.run('send'); });
    await waitFor(() => expect(result.current.dialog?.kind).toBe('it-sign'));

    const dialog = result.current.dialog;
    if (dialog?.kind !== 'it-sign') throw new Error('signature IT attendue');
    expect(dialog.action.pdfType).toBe('mise_disposition');
    vi.mocked(api.post).mockResolvedValueOnce(bonFiche({ status: 'sent_mise_dispo' }));
    await act(async () => { await dialog.action.onSigned(); });
    expect(api.post).toHaveBeenCalledWith('/bons/b1/send', {});
  });

  it('renvoyer un document dont la signature IT manque : signature IT d’abord', async () => {
    const pending = { type: 'restitution' as const, expired: true, inPerson: false, itSigned: false, sentAt: null, expiresAt: null };
    const { result } = await loaded(bonFiche({ status: 'partially_returned', pendingSignature: pending }));
    act(() => { result.current.run('resend'); });
    expect(result.current.dialog).toMatchObject({ kind: 'it-sign', action: { pdfType: 'restitution' } });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('renvoi refusé car un lien valide est récent : demande de confirmation, sans toast d’erreur', async () => {
    const sentAt = '2026-01-01T10:00:00.000Z';
    const { result } = await loaded();
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'Trop récent', { code: 'token_recent', sentAt }));
    await act(async () => { await result.current.resend(false); });
    expect(result.current.dialog).toEqual({ kind: 'resend-confirm', sentAt });
    expect(toast).not.toHaveBeenCalled();
  });

  it('restitution au guichet : marquage des équipements cochés, puis signature IT (rien d’autre ne part)', async () => {
    const { result } = await loaded();
    vi.mocked(api.post).mockResolvedValueOnce(bonFiche({ status: 'partially_returned' }));
    await act(async () => { await result.current.confirmRestitution(['e1'], 'in_person'); });
    expect(api.post).toHaveBeenCalledWith('/bons/b1/initiate-restitution', { returnedEquipmentIds: ['e1'], inPerson: true });
    expect(result.current.dialog).toMatchObject({ kind: 'it-sign', action: { pdfType: 'restitution' } });
  });

  it('annuler le bon passe le motif ; une erreur s’affiche en toast', async () => {
    const { result } = await loaded(bonFiche({ status: 'sent_mise_dispo' }));
    vi.mocked(api.post).mockRejectedValueOnce(new Error('boom'));
    await act(async () => { await result.current.confirmReason('cancel', 'Recrutement annulé'); });
    expect(api.post).toHaveBeenCalledWith('/bons/b1/cancel', { reason: 'Recrutement annulé' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'boom' }));
  });

  it('modifier un bon envoyé demande d’abord confirmation', async () => {
    const { result } = await loaded(bonFiche({ status: 'sent_mise_dispo' }));
    act(() => { result.current.run('edit'); });
    expect(result.current.dialog).toEqual({ kind: 'edit-sent' });
  });
});
