import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('transmet le signal d’annulation et les en-têtes propres à l’appel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: true }));
    global.fetch = fetchMock;
    const controller = new AbortController();

    await api.get('/x', { signal: controller.signal, headers: { 'X-Client': 'test' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toMatchObject({
      'X-Client': 'test',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
    });
    expect(init.credentials).toBe('include');
  });

  it('transmet le signal et les en-têtes sur les écritures (post, put, patch, delete)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    global.fetch = fetchMock;
    const { signal } = new AbortController();
    const options = { signal, headers: { 'X-Client': 'test' } };

    await api.post('/x', { a: 1 }, options);
    await api.put('/x', { a: 1 }, options);
    await api.patch('/x', { a: 1 }, options);
    await api.delete('/x', options);

    const inits = fetchMock.mock.calls.map((call) => call[1] as RequestInit);
    expect(inits.map((i) => i.method)).toEqual(['POST', 'PUT', 'PATCH', 'DELETE']);
    for (const init of inits) {
      expect(init.signal).toBe(signal);
      expect(init.headers).toMatchObject({ 'X-Client': 'test' });
    }
    expect(inits[0].body).toBe('{"a":1}');
  });

  it('une requête annulée échoue avec AbortError, sans tentative de rafraîchissement', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abort);
    global.fetch = fetchMock;

    await expect(api.get('/x', { signal: AbortSignal.abort() })).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('plusieurs 401 simultanés ne déclenchent qu’un seul rafraîchissement de session', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) return Promise.resolve(jsonRes(200, {}));
      const alreadyRefreshed = fetchMock.mock.calls.some(([u]) => u.endsWith('/auth/refresh'));
      return Promise.resolve(alreadyRefreshed ? jsonRes(200, { url }) : jsonRes(401, {}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([api.get('/a'), api.get('/b')]);

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  describe('option onUnauthorized', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { origin: originalLocation.origin, pathname: '/inventaire', search: '?vue=collaborateurs', href: 'inchangé' },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
    });

    it('« no-redirect » : session irrécupérable → ApiError 401, la page n’est pas quittée', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonRes(401, {})) // /auth/me → 401
        .mockResolvedValueOnce(jsonRes(401, {})); // /auth/refresh → échec
      global.fetch = fetchMock;

      await expect(api.get('/auth/me', { onUnauthorized: 'no-redirect' }))
        .rejects.toMatchObject({ status: 401 });
      expect(window.location.href).toBe('inchangé');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('« no-redirect » : session rafraîchie → la requête est rejouée normalement', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonRes(401, {}))
        .mockResolvedValueOnce(jsonRes(200, {}))
        .mockResolvedValueOnce(jsonRes(200, { id: 'u1' }));
      global.fetch = fetchMock;

      await expect(api.get('/auth/me', { onUnauthorized: 'no-redirect' })).resolves.toEqual({ id: 'u1' });
      expect(window.location.href).toBe('inchangé');
    });

    it('« no-refresh » : le 401 remonte tel quel (message du serveur), sans rafraîchir ni rediriger', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonRes(401, { message: 'Identifiants incorrects' }));
      global.fetch = fetchMock;

      await expect(api.post('/auth/local-login', {}, { onUnauthorized: 'no-refresh' }))
        .rejects.toMatchObject({ status: 401, message: 'Identifiants incorrects' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe('inchangé');
    });

    it('par défaut : redirige vers la connexion en gardant la page courante', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonRes(401, {}));

      await expect(api.get('/x')).rejects.toMatchObject({ status: 401 });
      expect(window.location.href).toBe('/login?returnTo=%2Finventaire%3Fvue%3Dcollaborateurs');
    });
  });

  describe('téléchargement de fichier (getFile)', () => {
    function fileRes(body: string, headers: Record<string, string>, status = 200): Response {
      return new Response(body, { status, headers });
    }

    it('renvoie le contenu, le nom annoncé par le serveur et l’indicateur de troncature', async () => {
      global.fetch = vi.fn().mockResolvedValue(fileRes('a;b\n1;2', {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="inventaire-2026-09-24.csv"',
        'X-Truncated': 'true',
      }));

      const file = await api.getFile('/reporting/inventory/export');

      expect(file.filename).toBe('inventaire-2026-09-24.csv');
      expect(file.truncated).toBe(true);
      expect(await file.blob.text()).toBe('a;b\n1;2');
    });

    it('sans en-têtes : nom inconnu (null) et fichier complet', async () => {
      global.fetch = vi.fn().mockResolvedValue(fileRes('x', {}));

      const file = await api.getFile('/x');

      expect(file.filename).toBeNull();
      expect(file.truncated).toBe(false);
    });

    it('envoie l’en-tête CSRF, le signal et les en-têtes propres à l’appel', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fileRes('x', {}));
      global.fetch = fetchMock;
      const { signal } = new AbortController();

      await api.getFile('/x', { signal, headers: { Accept: 'text/csv' } });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/x');
      expect(init.signal).toBe(signal);
      expect(init.headers).toMatchObject({ Accept: 'text/csv', 'X-Requested-With': 'XMLHttpRequest' });
    });

    it('lève une ApiError lisible quand le serveur refuse', async () => {
      global.fetch = vi.fn().mockResolvedValue(fileRes(JSON.stringify({ message: 'Export interdit' }), {}, 403));

      await expect(api.getFile('/x')).rejects.toMatchObject({ status: 403, message: 'Export interdit' });
    });

    it('getBlob (appelants historiques) renvoie toujours un simple Blob', async () => {
      global.fetch = vi.fn().mockResolvedValue(fileRes('pdf', { 'Content-Disposition': 'inline; filename="b.pdf"' }));

      const blob = await api.getBlob('/bons/1/pdf');

      // Le Blob vient ici de `Response` (Node) et non de jsdom : on vérifie
      // la forme (contenu lisible, pas d'enveloppe { blob, filename }).
      expect(blob.constructor.name).toBe('Blob');
      expect(blob).not.toHaveProperty('filename');
      expect(await blob.text()).toBe('pdf');
    });
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
