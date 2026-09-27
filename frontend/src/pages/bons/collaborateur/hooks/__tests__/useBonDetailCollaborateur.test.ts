import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PortalBon } from '@/contracts/bons';
import type { MyContestation } from '@/contracts/contestations';
import { useBonDetailCollaborateur } from '../useBonDetailCollaborateur';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), getBlob: vi.fn() },
  };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const bonFixture = {
  id: 'b1',
  reference: 'BON-2026-0001',
  status: 'sent_restitution',
  civilite: 'mr',
  dateMiseDisposition: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  collaborateur: { id: 'c1', displayName: 'Jean Dupont', email: 'jean@livio.fr', department: null },
  collaborateurEmail: 'jean@livio.fr',
  filiale: { id: 'f1', name: 'siege', displayName: 'Siège' },
  equipments: [],
  signatures: [],
} as unknown as PortalBon;

const portalVersion: PortalBon = {
  ...bonFixture,
  signatures: [
    {
      id: 's1',
      type: 'restitution',
      signed: false,
      signedAt: null,
      signerEmail: null,
      mentionLuApprouve: false,
      isInPerson: false,
      tokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdAt: '2026-09-01T00:00:00Z',
      pdfType: null,
      token: 'jeton-restitution',
    },
  ],
};

const contestation: MyContestation = {
  id: 'c-1',
  bon: { id: 'b1', reference: 'BON-2026-0001' },
  contestedDocument: 'mise_disposition',
  message: 'Il manque le chargeur.',
  status: 'rejected',
  outcome: 'not_retained',
  createdAt: '2026-08-01T00:00:00Z',
  reviewedAt: null,
  resolvedAt: '2026-08-03T00:00:00Z',
  resolutionMessage: 'Chargeur livré à part.',
  replacementBon: null,
};

function mockGets(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/bons/b1': bonFixture,
    '/bons/mes-bons': [portalVersion],
    '/contestations/mine': [contestation],
    '/bons/b1/pdf-snapshots': [{ type: 'signature_collab_mise_disposition', filename: 'a.pdf', createdAt: '2026-01-02', sha256: null }],
    ...overrides,
  };
  vi.mocked(api.get).mockImplementation((path: string) =>
    path in responses ? Promise.resolve(responses[path]) : Promise.reject(new Error(`GET inattendu ${path}`)),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useBonDetailCollaborateur', () => {
  it('charge le bon, le document à signer (avec son lien), sa contestation et ses documents', async () => {
    mockGets();
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bon?.reference).toBe('BON-2026-0001');
    expect(result.current.toSign).toMatchObject({ type: 'restitution', token: 'jeton-restitution' });
    expect(result.current.contestation?.resolutionMessage).toBe('Chargeur livré à part.');
    await waitFor(() => expect(result.current.pdfSnapshots).toHaveLength(1));
  });

  it('le suivi indisponible n’empêche pas d’afficher le bon', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/bons/b1' ? Promise.resolve(bonFixture) : Promise.reject(new Error('panne')),
    );
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bon).not.toBeNull();
    expect(result.current.contestation).toBeNull();
    expect(result.current.toSign).toBeNull();
  });

  it('bon d’un autre : le message du serveur est affiché', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/bons/b1' ? Promise.reject(new Error('Accès refusé à ce bon')) : Promise.resolve([]),
    );
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe('Accès refusé à ce bon');
    expect(result.current.bon).toBeNull();
  });

  /** Onglet ouvert par window.open, tel que le hook s'en sert. */
  function fakeTab() {
    return { opener: {}, location: { href: '' }, addEventListener: vi.fn(), close: vi.fn() };
  }

  it('ouvre le document dans le navigateur (onglet ouvert au geste, rempli ensuite), sans le télécharger', async () => {
    mockGets();
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.bon).not.toBeNull());

    await act(async () => {
      await result.current.openPdf('3f1c2a4e-9b8d-4c7e-a1f2-0d9e8c7b6a51');
    });

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(api.getBlob).toHaveBeenCalledWith('/bons/b1/pdf?snapshot=3f1c2a4e-9b8d-4c7e-a1f2-0d9e8c7b6a51');
    expect(tab.location.href).toBe('blob:fake-url');
    expect(result.current.pdfLoading).toBeNull();
    URL.createObjectURL = originalCreate;
    open.mockRestore();
  });

  it('fenêtres bloquées : on le dit, sans appel inutile', async () => {
    mockGets();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.bon).not.toBeNull());
    await act(async () => {
      await result.current.openPdf('3f1c2a4e-9b8d-4c7e-a1f2-0d9e8c7b6a51');
    });
    expect(api.getBlob).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/pop-up/) }));
    open.mockRestore();
  });

  it('échec du chargement : l’onglet est refermé et un message d’erreur est affiché', async () => {
    mockGets();
    vi.mocked(api.getBlob).mockRejectedValue(new Error('Document introuvable'));
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const { result } = renderHook(() => useBonDetailCollaborateur('b1'));
    await waitFor(() => expect(result.current.bon).not.toBeNull());
    await act(async () => {
      await result.current.openPdf('3f1c2a4e-9b8d-4c7e-a1f2-0d9e8c7b6a51');
    });
    expect(tab.close).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Document introuvable', variant: 'destructive' }));
    open.mockRestore();
  });
});
