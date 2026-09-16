import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

function mockAuthFetch() {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/setup-required')) {
      return Promise.resolve({ ok: true, json: async () => ({ setupRequired: false }) } as Response);
    }
    if (url.includes('/auth/local-auth-status')) {
      return Promise.resolve({ ok: true, json: async () => ({ enabled: true }) } as Response);
    }
    if (url.includes('/auth/local-login')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, mustChangePassword: false }) } as Response);
    }
    return Promise.reject(new Error(`fetch non mocké dans ce test : ${url}`));
  }) as unknown as typeof fetch;
}

async function submitLocalLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('Connexion avec un compte local'));
  await user.type(screen.getByLabelText('Email'), 'admin@local');
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
});
