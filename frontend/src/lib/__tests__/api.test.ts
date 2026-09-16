import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api';

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function rawRes(status: number, text: string): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => text } as Response;
}

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET parses JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(200, { hello: 'world' }));
    await expect(api.get('/x')).resolves.toEqual({ hello: 'world' });
  });

  it('throws an ApiError carrying the server message on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(400, { message: 'Mauvaise requête' }));
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
    await expect(api.get('/x')).rejects.toMatchObject({ status: 400, message: 'Mauvaise requête' });
  });

  it('joins class-validator array messages', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(422, { message: ['champ A invalide', 'champ B invalide'] }));
    await expect(api.get('/x')).rejects.toMatchObject({ message: 'champ A invalide — champ B invalide' });
  });

  it('refreshes the session once on 401 then retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, {})) // requête initiale → 401
      .mockResolvedValueOnce(jsonRes(200, {})) // /auth/refresh → ok
      .mockResolvedValueOnce(jsonRes(200, { ok: true })); // rejeu → ok
    global.fetch = fetchMock;

    await expect(api.get('/x')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/refresh');
  });

  it('redirects to /login with the current page as returnTo when the refresh itself fails', async () => {
    const originalLocation = window.location;
    // Même technique que Login.test.tsx : jsdom lève "Not implemented:
    // navigation" sur une vraie assignation à location.href, et les champs de
    // Location sont des getters du prototype qu'un simple spread ne copie pas.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: originalLocation.origin, pathname: '/bons/42', search: '?tab=history', href: '' },
    });

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonRes(401, {})) // requête initiale → 401
        .mockResolvedValueOnce(jsonRes(401, {})); // /auth/refresh échoue aussi
      global.fetch = fetchMock;

      await expect(api.get('/x')).rejects.toMatchObject({ status: 401, message: 'Session expirée' });
      expect(window.location.href).toBe('/login?returnTo=%2Fbons%2F42%3Ftab%3Dhistory');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
    }
  });

  it('surfaces a fixed rate-limit message on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(429, { message: 'ignoré' }));
    await expect(api.get('/x')).rejects.toMatchObject({
      status: 429,
      message: 'Trop de requêtes, réessayez dans une minute.',
    });
  });

  it('never surfaces a raw HTML error body (e.g. a proxy 502) in the message', async () => {
    global.fetch = vi.fn().mockResolvedValue(rawRes(502, '<html><body>Bad Gateway</body></html>'));
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, message: 'Erreur HTTP 502' });
    expect((err as Error).message).not.toContain('<html>');
  });

  it('patchForm sends a multipart PATCH with the CSRF header and no explicit Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: true }));
    global.fetch = fetchMock;
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');

    await api.patchForm('/attachments/1', form);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('/api/attachments/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({ 'X-Requested-With': 'XMLHttpRequest' });
  });
});
