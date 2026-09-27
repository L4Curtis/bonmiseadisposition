import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  isManualAccount: false,
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
    collaborateurId: 'u1',
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

  it('lien invalidé sans motif connu : message neutre, sans promettre un nouveau lien (R-038)', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'replaced', reference: 'BDM-1', invalidatedReason: null });

    renderSignaturePage();

    expect(await screen.findByText('Lien plus valable')).toBeInTheDocument();
    expect(screen.queryByText(/vous a été envoyé/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir mes équipements' })).toHaveAttribute('href', '/mes-bons');
  });

  it.each([
    ['closed_without_signature', 'Bon clôturé'],
    ['in_person', 'Signature au guichet'],
    ['modified', 'Bon modifié'],
    ['cancelled', 'Bon annulé'],
    ['replaced', 'Lien remplacé'],
  ])('lien invalidé (%s) : « %s »', async (reason, title) => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'replaced', reference: 'BDM-1', invalidatedReason: reason });

    renderSignaturePage();

    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('lien expiré : « Demander un nouveau lien » en un geste, puis la réponse (R-058)', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'expired', reference: 'BDM-1' });
    vi.mocked(api.post).mockResolvedValue({ ok: true, status: 'requested', requestedAt: '2026-09-25T08:00:00Z' });

    const { user } = renderSignaturePage();

    await user.click(await screen.findByRole('button', { name: 'Demander un nouveau lien' }));
    expect(api.post).toHaveBeenCalledWith('/signature/tok-1/request-new-link');
    expect(await screen.findByRole('status')).toHaveTextContent(/équipe informatique/);
  });

  it('bon contesté : la contestation est en cours, rien à signer', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'contested', reference: 'BDM-1' });

    renderSignaturePage();

    expect(await screen.findByText('Contestation en cours')).toBeInTheDocument();
  });

  it('document déjà signé : retour à « Mes équipements »', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({ status: 'already_signed', reference: 'BDM-1', bonId: 'bon-1' });

    renderSignaturePage();

    expect(await screen.findByText('Document déjà signé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir mes équipements' })).toHaveAttribute('href', '/mes-bons');
  });

  it('restitution à signer : « Je ne suis pas d’accord » envoie une contestation de la restitution (R-054)', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({
      ...pendingResponse,
      signature: { ...pendingResponse.signature, type: 'restitution' },
    });
    vi.mocked(api.post).mockResolvedValue({ id: 'c-1', status: 'open' });

    const { user } = renderSignaturePage();

    await user.click(await screen.findByRole('button', { name: /je ne suis pas d'accord/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Contester la restitution du bon BDM-2026-001' });
    expect(dialog).toBeInTheDocument();
    await user.type(screen.getByLabelText('Motif de contestation'), 'J’ai aussi rendu la sacoche.');
    await user.click(screen.getByRole('button', { name: 'Envoyer la contestation' }));

    expect(api.post).toHaveBeenCalledWith('/bons/bon-1/contestation', {
      message: 'J’ai aussi rendu la sacoche.',
      document: 'restitution',
    });
    expect(await screen.findByText('Contestation envoyée')).toBeInTheDocument();
  });

  it('la remise ne se conteste pas depuis la page de signature, ni une signature au guichet', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue(pendingResponse);
    renderSignaturePage();
    await screen.findByRole('button', { name: /signer le bon de mise à disposition/i });
    expect(screen.queryByRole('button', { name: /je ne suis pas d'accord/i })).not.toBeInTheDocument();
  });

  it('signature au guichet recueillie par le technicien : qui a signé, en présence de qui (R-059)', async () => {
    mockAuthMe({ ...currentUser, id: 'tech-1', displayName: 'Julie Moreau', role: 'technician' });
    vi.mocked(api.get).mockResolvedValue({
      ...pendingResponse,
      bon: { ...pendingResponse.bon, collaborateur: { displayName: 'Léa Martin', email: 'lea@livio.fr' } },
      signature: { ...pendingResponse.signature, type: 'pv_cloture', isInPerson: true },
    });
    vi.mocked(api.post).mockResolvedValue({ ok: true, bonId: 'bon-1', signedByProxy: true });

    const { user } = renderSignaturePage();

    await user.click(await screen.findByRole('checkbox'));
    drawOnCanvas();
    await user.click(screen.getByRole('button', { name: /signer le pv de non-restitution/i }));

    expect(
      await screen.findByText(/a été signé par Léa Martin, au guichet, en présence de Julie Moreau/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à la fiche du bon' })).toHaveAttribute('href', '/bons/bon-1');
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

    resolvePost({ ok: true, bonId: 'bon-1', signedByProxy: false });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });

  it('says what is still missing while the "Signer" button is disabled', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue(pendingResponse);

    const { user } = renderSignaturePage();

    expect(await screen.findByText('Tracez votre signature et cochez « Lu et approuvé » pour signer.')).toBeInTheDocument();
    drawOnCanvas();
    expect(screen.getByText('Cochez « Lu et approuvé » pour signer.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByText(/pour signer\.$/)).not.toBeInTheDocument();
  });

  it('keeps "Effacer" disabled until something is drawn, then clears the canvas', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue(pendingResponse);

    const { user } = renderSignaturePage();

    const effacer = await screen.findByRole('button', { name: /effacer/i });
    expect(effacer).toBeDisabled();
    drawOnCanvas();
    expect(effacer).not.toBeDisabled();
    await user.click(effacer);
    expect(effacer).toBeDisabled();
  });

  it('hides the "Email" row for a collaborateur without an address', async () => {
    mockAuthMe(currentUser);
    vi.mocked(api.get).mockResolvedValue({
      ...pendingResponse,
      bon: { ...pendingResponse.bon, collaborateurEmail: '' },
      signature: { ...pendingResponse.signature, isInPerson: true },
    });

    renderSignaturePage();

    expect(await screen.findByText('Destinataire')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('sends a single POST when "Signer" is pressed twice before the next render', async () => {
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
    // Deux appuis dans la même tâche : le bouton n'a pas encore été re-rendu
    // désactivé, seul le verrou synchrone du hook empêche le second envoi.
    submit.click();
    submit.click();

    resolvePost({ ok: true, bonId: 'bon-1', signedByProxy: false });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });

  describe('tracé au doigt sur téléphone (2E)', () => {
    it('« Agrandir » ouvre le même tracé en plein écran ; « Terminer » le rend au formulaire, signature gardée', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      const { user } = renderSignaturePage();

      await user.click(await screen.findByRole('button', { name: 'Agrandir la zone de signature' }));
      const plein = screen.getByRole('dialog', { name: 'Signature en plein écran' });
      // Un seul canevas : c'est le même, agrandi — rien ne se perd au passage.
      expect(document.querySelectorAll('canvas')).toHaveLength(1);
      expect(plein).toContainElement(document.querySelector('canvas'));
      expect(document.body.style.overflow).toBe('hidden');

      drawOnCanvas();
      await user.click(screen.getByRole('button', { name: 'Terminer' }));

      expect(screen.queryByRole('dialog', { name: 'Signature en plein écran' })).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
      await user.click(screen.getByRole('checkbox'));
      expect(screen.getByRole('button', { name: /signer le bon de mise à disposition/i })).toBeEnabled();
    });

    it('en plein écran : « Effacer » reste à portée, Échap referme', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      const { user } = renderSignaturePage();

      await user.click(await screen.findByRole('button', { name: 'Agrandir la zone de signature' }));
      const plein = screen.getByRole('dialog', { name: 'Signature en plein écran' });
      drawOnCanvas();
      const effacer = within(plein).getByRole('button', { name: /effacer/i });
      expect(effacer).toBeEnabled();
      await user.click(effacer);
      expect(effacer).toBeDisabled();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Signature en plein écran' })).not.toBeInTheDocument();
    });

    it('pincer ou zoomer sur la zone de signature ne fait ni zoomer ni défiler la page', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      renderSignaturePage();
      const canvas = await waitFor(() => {
        const c = document.querySelector('canvas');
        if (!c) throw new Error('canevas absent');
        return c;
      });

      const pinch = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(pinch, 'touches', { value: [{}, {}] });
      canvas.dispatchEvent(pinch);
      expect(pinch.defaultPrevented).toBe(true);

      // Safari iOS : geste de zoom propriétaire.
      const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
      canvas.dispatchEvent(gesture);
      expect(gesture.defaultPrevented).toBe(true);
    });
  });

  describe('plein écran : clavier et zoom de la page (2E)', () => {
    it('à la fermeture, le focus revient sur « Agrandir » (Terminer comme Échap)', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      const { user } = renderSignaturePage();

      const agrandir = await screen.findByRole('button', { name: 'Agrandir la zone de signature' });
      await user.click(agrandir);
      await user.click(screen.getByRole('button', { name: 'Terminer' }));
      expect(screen.getByRole('button', { name: 'Agrandir la zone de signature' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Agrandir la zone de signature' }));
      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: 'Agrandir la zone de signature' })).toHaveFocus();
    });

    it('Tab reste dans le panneau plein écran (la page derrière est masquée)', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      const { user } = renderSignaturePage();

      await user.click(await screen.findByRole('button', { name: 'Agrandir la zone de signature' }));
      const plein = screen.getByRole('dialog', { name: 'Signature en plein écran' });
      drawOnCanvas();
      const effacer = within(plein).getByRole('button', { name: /effacer/i });
      const terminer = within(plein).getByRole('button', { name: 'Terminer' });

      terminer.focus();
      await user.tab();
      expect(effacer).toHaveFocus();
      await user.tab({ shift: true });
      expect(terminer).toHaveFocus();
    });

    it('hors de la zone de signature, pincer zoome la page normalement (malvoyants)', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue(pendingResponse);
      renderSignaturePage();
      const agrandir = await screen.findByRole('button', { name: 'Agrandir la zone de signature' });

      const pinch = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(pinch, 'touches', { value: [{}, {}] });
      agrandir.dispatchEvent(pinch);
      expect(pinch.defaultPrevented).toBe(false);

      const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
      screen.getByRole('button', { name: /effacer/i }).dispatchEvent(gesture);
      expect(gesture.defaultPrevented).toBe(false);
    });
  });

  describe('lecture du document sur téléphone (2E)', () => {
    it('chaque équipement en carte, n° de série en entier (jamais un tableau qui défile de côté)', async () => {
      mockAuthMe(currentUser);
      vi.mocked(api.get).mockResolvedValue({
        ...pendingResponse,
        bon: {
          ...pendingResponse.bon,
          equipments: [
            {
              id: 'e1', order: 0, serialNumber: 'SN-C02XK-TRES-LONG-0001', inventoryNumber: 'INV-42', customLabel: null,
              returnedAt: null, notReturned: false, notReturnedReason: null,
              catalogItem: { brand: 'Apple', model: 'MacBook Air 13', category: 'pc_portable' },
            },
          ],
        },
      });
      renderSignaturePage();

      const liste = await screen.findByRole('list', { name: 'Équipements (1)' });
      expect(within(liste).getByText('Apple MacBook Air 13')).toBeInTheDocument();
      expect(within(liste).getByText('SN-C02XK-TRES-LONG-0001')).toBeInTheDocument();
      expect(document.querySelector('table')).toBeNull();
    });
  });

  describe('connexion depuis le lien de l’email (2E, R-096)', () => {
    let originalLocation: Location;
    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { origin: originalLocation.origin, href: '' },
      });
    });
    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
    });

    it('jeton piégé dans l’adresse : le retour après connexion reste un seul segment sous /signer/', async () => {
      mockAuthMe(null);
      vi.mocked(api.get).mockResolvedValue({ enabled: true });
      vi.mocked(api.post).mockResolvedValue({ ok: true, mustChangePassword: false });
      const { user } = renderSignaturePage('/signer/..%2F..%2Fadmin%3Fx%3D1');

      expect(await screen.findByRole('link', { name: /continuer avec microsoft/i })).toHaveAttribute(
        'href',
        `/api/auth/login?returnTo=${encodeURIComponent('/signer/..%2F..%2Fadmin%3Fx%3D1')}`,
      );
      await user.type(await screen.findByLabelText('Adresse email'), 'jean@livio.fr');
      await user.type(screen.getByLabelText('Mot de passe'), 'secret');
      await user.click(screen.getByRole('button', { name: 'Se connecter' }));
      await waitFor(() => expect(window.location.href).toBe('/signer/..%2F..%2Fadmin%3Fx%3D1'));
    });

    it('pas connecté : Microsoft et le formulaire sur le même écran, puis retour direct au document', async () => {
      mockAuthMe(null);
      vi.mocked(api.get).mockResolvedValue({ enabled: true });
      vi.mocked(api.post).mockResolvedValue({ ok: true, mustChangePassword: false });
      const { user } = renderSignaturePage();

      expect(await screen.findByRole('link', { name: /continuer avec microsoft/i })).toHaveAttribute(
        'href',
        '/api/auth/login?returnTo=%2Fsigner%2Ftok-1',
      );
      await user.type(await screen.findByLabelText('Adresse email'), 'jean@livio.fr');
      await user.type(screen.getByLabelText('Mot de passe'), 'secret');
      await user.click(screen.getByRole('button', { name: 'Se connecter' }));

      expect(api.post).toHaveBeenCalledWith(
        '/auth/local-login',
        { email: 'jean@livio.fr', password: 'secret' },
        { onUnauthorized: 'no-refresh' },
      );
      await waitFor(() => expect(window.location.href).toBe('/signer/tok-1'));
    });

    it('connexion locale désactivée : seulement Microsoft', async () => {
      mockAuthMe(null);
      vi.mocked(api.get).mockResolvedValue({ enabled: false });
      renderSignaturePage();

      await screen.findByRole('link', { name: /continuer avec microsoft/i });
      await waitFor(() => expect(screen.queryByLabelText('Adresse email')).not.toBeInTheDocument());
      expect(api.get).toHaveBeenCalledWith('/auth/local-auth-status', expect.objectContaining({ onUnauthorized: 'no-refresh' }));
    });
  });
});
