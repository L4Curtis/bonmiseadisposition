import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LoginPage } from '../Login';

// Régression CRITIQUE (relecture LOT G) : la validation précédente
// (/^\/[^/]/.test(returnTo)) laisse passer des payloads comme "/\evil.com"
// ou "/%09/evil.com" que le navigateur normalise en URL ABSOLUE vers un
// autre host au moment de l'assignation à window.location.href — un open
// redirect. La comparaison d'origine (new URL(v, origin).origin === origin)
// doit les rejeter et retomber sur '/'.
//
// Ces payloads sont écrits ici tels qu'ils apparaissent dans l'URL d'attaque
// (segment de query string), PAS ré-encodés par le test : "%09"/"%0a" sont
// décodés par URLSearchParams en une vraie tabulation/nouvelle ligne au
// moment de searchParams.get('returnTo') — exactement le canal par lequel
// l'attaque arrive en pratique. Le WHATWG URL parser retire ensuite tout
// tab/newline AVANT de parser le reste, ce qui transforme par exemple
// "/\t/evil.com" en "//evil.com" (référence réseau-relative → host = evil.com).
const OPEN_REDIRECT_PAYLOADS = ['/\\evil.com', '/%09/evil.com', '/%0a/evil.com'];

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockAuthFetch(loginResponse: () => Response = () => jsonRes(200, { ok: true, mustChangePassword: false })) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/setup-required')) return Promise.resolve(jsonRes(200, { setupRequired: false }));
    if (url.includes('/auth/local-auth-status')) return Promise.resolve(jsonRes(200, { enabled: true }));
    if (url.includes('/auth/local-login')) return Promise.resolve(loginResponse());
    return Promise.reject(new Error(`fetch non mocké dans ce test : ${url}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function submitLocalLogin(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('link', { name: /continuer avec microsoft/i });
  // Venu d'un lien du collaborateur, le formulaire est déjà ouvert.
  const toggle = screen.queryByRole('button', { name: 'Connexion avec un compte local' });
  if (toggle) await user.click(toggle);
  await user.type(screen.getByLabelText('Adresse email'), 'admin@local');
  await user.type(screen.getByLabelText('Mot de passe'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('LoginPage — protection open-redirect sur returnTo', () => {
  let originalLocation: Location;

  beforeEach(() => {
    mockAuthFetch();
    originalLocation = window.location;
    // jsdom lève "Not implemented: navigation" sur une vraie assignation à
    // location.href, et Location expose ses champs via des getters du
    // prototype (un simple spread ne les copie pas) : on reconstruit un objet
    // plat avec l'origin réel, pour que isSafeReturnTo() compare contre la
    // même origine que dans l'application.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: originalLocation.origin, href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it.each(OPEN_REDIRECT_PAYLOADS)(
    'rejette returnTo=%s (open redirect) et redirige vers / après connexion locale',
    async (payload) => {
      const user = userEvent.setup();
      // Pas d'encodeURIComponent ici : le payload EST déjà le segment de
      // query string tel qu'il apparaîtrait dans l'URL d'attaque.
      render(
        <MemoryRouter initialEntries={[`/login?returnTo=${payload}`]}>
          <LoginPage />
        </MemoryRouter>,
      );

      await submitLocalLogin(user);

      await waitFor(() => expect(window.location.href).toBe('/'));
    },
  );

  it('conserve un returnTo interne valide', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fsigner%2Fabc123']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await submitLocalLogin(user);

    await waitFor(() => expect(window.location.href).toBe('/signer/abc123'));
  });

  it('revient à une page avec ses filtres (lien profond ouvert sans session)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Finventaire%3Fvue%3Dcollaborateurs%26compte%3Dinactif']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await submitLocalLogin(user);

    await waitFor(() => expect(window.location.href).toBe('/inventaire?vue=collaborateurs&compte=inactif'));
  });

  it('mot de passe à changer : returnTo est transmis à la page de changement', async () => {
    mockAuthFetch(() => jsonRes(200, { ok: true, mustChangePassword: true }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fbons%3Fstatus%3Dactive']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await submitLocalLogin(user);

    await waitFor(() => expect(window.location.href)
      .toBe('/change-password?forced=true&returnTo=%2Fbons%3Fstatus%3Dactive'));
  });

  it('identifiants refusés : message du serveur, sans tentative de rafraîchir une session', async () => {
    const fetchMock = mockAuthFetch(() => jsonRes(401, { message: 'Identifiants incorrects' }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await submitLocalLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects');
    expect(window.location.href).toBe('');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/refresh'))).toBe(false);
  });
});

describe('LoginPage — lien de connexion Microsoft', () => {
  beforeEach(() => {
    mockAuthFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes a valid returnTo in the Microsoft SSO link', async () => {
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fsigner%2Fabc123']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: /continuer avec microsoft/i });
    expect(link).toHaveAttribute('href', '/api/auth/login?returnTo=%2Fsigner%2Fabc123');
  });

  it('donne son titre à l’onglet : « Connexion · Bons IT »', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await screen.findByRole('link', { name: /continuer avec microsoft/i });
    expect(document.title).toBe('Connexion · Bons IT');
  });

  it('omits returnTo from the Microsoft SSO link when none is provided', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: /continuer avec microsoft/i });
    expect(link).toHaveAttribute('href', '/api/auth/login');
  });
});

describe('LoginPage — venu du lien reçu par email (2E, R-096)', () => {
  beforeEach(() => {
    mockAuthFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['/signer/abc123', '/mes-bons', '/mes-bons/b-1'])(
    'returnTo=%s : formulaire ouvert d’emblée, habillage clair, mots du collaborateur',
    async (returnTo) => {
      render(
        <MemoryRouter initialEntries={[`/login?returnTo=${encodeURIComponent(returnTo)}`]}>
          <LoginPage />
        </MemoryRouter>,
      );

      expect(await screen.findByLabelText('Adresse email')).toBeVisible();
      expect(screen.getByLabelText('Mot de passe')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Connexion avec un compte local' })).not.toBeInTheDocument();
      expect(screen.queryByText(/IT uniquement/)).not.toBeInTheDocument();
      expect(screen.queryByText(/admin@local/)).not.toBeInTheDocument();
      expect(screen.getByText(/Équipe informatique/)).toBeInTheDocument();
      expect(screen.queryByText(/Service informatique/)).not.toBeInTheDocument();
    },
  );

  it('clavier adapté et remplissage automatique : email, puis mot de passe', async () => {
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fsigner%2Fabc123']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const email = await screen.findByLabelText('Adresse email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toHaveAttribute('autocapitalize', 'none');
    expect(email).toHaveAttribute('enterkeyhint', 'next');
    const password = screen.getByLabelText('Mot de passe');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('enterkeyhint', 'go');
  });

  it('connexion IT (sans lien) : « Équipe informatique », plus de mention « compte local IT »', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const toggle = await screen.findByRole('button', { name: 'Connexion avec un compte local' });
    expect(toggle.className).toMatch(/min-h-11/);
    expect(screen.getByText('Groupe Livio — Équipe informatique')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByLabelText('Adresse email')).toHaveAttribute('type', 'email');
    expect(screen.queryByText(/IT uniquement/)).not.toBeInTheDocument();
  });
});
