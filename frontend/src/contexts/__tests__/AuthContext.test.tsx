import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <p>chargement</p>;
  return <p>{user ? `connecté : ${user.displayName}` : 'déconnecté'}</p>;
}

const ME = { id: 'u1', displayName: 'Alice', role: 'admin' };

describe('AuthProvider — vérification de la session au chargement', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: originalLocation.origin, pathname: '/bons/42', search: '', href: 'inchangé' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it('session valide : l’utilisateur est connu', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(200, ME));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('connecté : Alice')).toBeInTheDocument();
  });

  it('accès expiré (15 min) mais session encore valable : rafraîchit puis relit le compte', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, {}))
      .mockResolvedValueOnce(jsonRes(200, {}))
      .mockResolvedValueOnce(jsonRes(200, ME));
    global.fetch = fetchMock;

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText('connecté : Alice')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
  });

  it('pas de session : déconnecté, SANS redirection (la garde des routes s’en charge avec returnTo)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, {}))
      .mockResolvedValueOnce(jsonRes(401, {}));

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText('déconnecté')).toBeInTheDocument();
    expect(window.location.href).toBe('inchangé');
  });

  it('serveur injoignable : déconnecté plutôt qu’un chargement sans fin', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('déconnecté')).toBeInTheDocument();
  });

  it('démontage pendant la vérification : la requête est annulée, rien n’est écrit', async () => {
    let signal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }) as unknown as typeof fetch;

    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    unmount();

    await waitFor(() => expect(signal?.aborted).toBe(true));
  });
});
