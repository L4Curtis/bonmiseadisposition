import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { SignaturePage } from '../SignaturePage';
import type { User } from '@/types';

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

const currentUser: User = {
  id: 'u1',
  samAccountName: 'jdupont',
  displayName: 'Jean Dupont',
  email: 'jean@livio.fr',
  isItStaff: false,
  isLocalAccount: false,
  mustChangePassword: false,
  role: 'collaborator',
  active: true,
};

function mockAuthMe(user: User | null) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/me')) {
      return Promise.resolve({ ok: !!user, status: user ? 200 : 401, json: async () => user } as Response);
    }
    return Promise.reject(new Error(`fetch non mocké dans ce test : ${url}`));
  }) as unknown as typeof fetch;
}

const pendingResponse = {
  status: 'pending' as const,
  bon: {
    id: 'bon-1',
    reference: 'BDM-2026-001',
    civilite: 'mr',
    dateMiseDisposition: '2026-01-10',
    collaborateur: { displayName: 'Jean Dupont', email: 'jean@livio.fr' },
    collaborateurEmail: 'jean@livio.fr',
    filiale: { name: 'siege', displayName: 'Siège' },
    equipments: [],
  },
  signature: {
    id: 'sig-1',
    type: 'mise_disposition',
    signed: false,
    isInPerson: false,
    tokenExpiresAt: '2099-12-31T23:59:59.000Z',
  },
};

function mockCanvasContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  // resetAllMocks (pas seulement clearAllMocks) : sans ça, une
  // mockResolvedValueOnce non consommée par un test (ex. un test qui court-
  // circuite avant son deuxième appel réseau attendu) reste en file et
  // contamine le test suivant.
  vi.resetAllMocks();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getBoundingClientRect;
  // jsdom ne rend pas HTMLCanvasElement.prototype.toDataURL — sans ce stub,
  // getDataUrl() (use-signature-canvas.ts) reçoit `undefined` du canvas
  // offscreen et handleSubmit s'arrête silencieusement avant tout POST.
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA');
});

function renderSignaturePage(route = '/signer/tok-1') {
  return renderWithProviders(<SignaturePage />, { route, path: '/signer/:token' });
}

function drawOnCanvas() {
  const canvas = document.querySelector('canvas')!;
  fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5 });
  fireEvent.mouseMove(canvas, { clientX: 25, clientY: 25 });
}

describe('SignaturePage', () => {
  it('shows "Lien invalide" when the signature fetch fails', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, 'Lien de signature introuvable'));

    renderSignaturePage();

    expect(await screen.findByText('Lien invalide')).toBeInTheDocument();
    expect(screen.getByText('Lien de signature introuvable')).toBeInTheDocument();
  });

  it('shows "Lien expiré" for an expired token', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'expired', reference: 'BDM-1' });

    renderSignaturePage();

    expect(await screen.findByText('Lien expiré')).toBeInTheDocument();
  });

  it('shows "Lien remplacé" for a token superseded by a newer link', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'replaced', reference: 'BDM-1' });

    renderSignaturePage();

    expect(await screen.findByText('Lien remplacé')).toBeInTheDocument();
  });

  it('shows a success screen with a "Mes bons" link when the document is already signed', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'already_signed', reference: 'BDM-1' });

    renderSignaturePage();

    expect(await screen.findByText('Document déjà signé ✓')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /accéder à mes bons/i })).toHaveAttribute('href', '/mes-bons');
  });

  it('shows "Bon annulé" for a cancelled bon', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'cancelled', reference: 'BDM-1' });

    renderSignaturePage();

    expect(await screen.findByText('Bon annulé')).toBeInTheDocument();
  });

  it('disables the "Signer" button until the canvas has a stroke AND "lu et approuvé" is checked', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue(pendingResponse);

    const { user } = renderSignaturePage();

    const submit = await screen.findByRole('button', { name: /signer le bon de mise à disposition/i });
    expect(submit).toBeDisabled();

    // Dessiner seul (case non cochée) : toujours désactivé
    drawOnCanvas();
    expect(submit).toBeDisabled();

    // + case cochée : activé
    await user.click(screen.getByRole('checkbox'));
    expect(submit).not.toBeDisabled();
  });

  it('falls back to the signed screen if the POST fails but a follow-up GET confirms already_signed', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValueOnce(pendingResponse); // chargement initial
    vi.mocked(api.post).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.mocked(api.get).mockResolvedValueOnce({ status: 'already_signed', reference: pendingResponse.bon.reference });

    const { user } = renderSignaturePage();

    await user.click(await screen.findByRole('checkbox'));
    drawOnCanvas();
    await user.click(screen.getByRole('button', { name: /signer le bon de mise à disposition/i }));

    expect(await screen.findByRole('heading', { name: /document signé/i })).toBeInTheDocument();
  });

  it('disables the submit button while submitting, so a double click only sends one POST', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue(pendingResponse);
    let resolvePost: (v: unknown) => void = () => {};
    vi.mocked(api.post).mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );

    const { user } = renderSignaturePage();

    await user.click(await screen.findByRole('checkbox'));
    drawOnCanvas();
    const submit = screen.getByRole('button', { name: /signer le bon de mise à disposition/i });

    await user.click(submit);
    expect(submit).toBeDisabled();
    // Un second clic pendant l'envoi ne doit rien déclencher (bouton désactivé)
    await user.click(submit);

    resolvePost(undefined);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });
});
