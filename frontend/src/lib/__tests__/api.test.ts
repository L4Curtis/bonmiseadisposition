import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, hasErrorCode, NETWORK_ERROR_MESSAGE, UNEXPECTED_RESPONSE_MESSAGE } from '../api';

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

  it('erreur unique : ApiError porte le code, le message et les détails', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonRes(409, {
        statusCode: 409,
        code: 'serial_conflicts',
        message: 'Des numéros de série sont déjà en circulation sur un autre bon.',
        details: { conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }] },
        conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }],
      }),
    );
    const error = await api.post('/bons/1/send').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'serial_conflicts',
      message: 'Des numéros de série sont déjà en circulation sur un autre bon.',
      details: { conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }] },
    });
    // Les écrans qui lisent encore le corps brut continuent de fonctionner.
    expect((error as ApiError).body).toMatchObject({ conflicts: [{ serialNumber: 'SN-1' }] });
  });

  it('ancien corps à code sans message : code et détails lus, message de repli', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(409, { code: 'token_recent', sentAt: '2026-10-01T08:00:00.000Z' }));
    await expect(api.post('/bons/1/resend')).rejects.toMatchObject({
      code: 'token_recent',
      details: { sentAt: '2026-10-01T08:00:00.000Z' },
      message: 'Erreur HTTP 409',
    });
  });

  it('erreur sans code : code et détails à null', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(404, { statusCode: 404, message: 'Bon introuvable', error: 'Not Found' }));
    await expect(api.get('/bons/x')).rejects.toMatchObject({ code: null, details: null, message: 'Bon introuvable' });
  });

  it('hasErrorCode reconnaît une ApiError par son code', async () => {
    const error = new ApiError(409, 'Lien récent', { statusCode: 409, code: 'token_recent', message: 'Lien récent' });
    expect(hasErrorCode(error, 'token_recent')).toBe(true);
    expect(hasErrorCode(error, 'serial_conflicts')).toBe(false);
    expect(hasErrorCode(new Error('x'), 'token_recent')).toBe(false);
  });

  it('getList lit la liste unique', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(200, { items: [{ id: 1 }], total: 30, page: 2, limit: 25, truncated: false }));
    await expect(api.getList<{ id: number }>('/users?page=2')).resolves.toEqual({
      items: [{ id: 1 }],
      total: 30,
      page: 2,
      limit: 25,
      truncated: false,
    });
  });

  it('getList lit encore l’ancienne forme de la route, le temps de la vague', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonRes(200, { users: [{ id: 1 }], total: 1, page: 1, limit: 20 }));
    await expect(api.getList('/users?page=1', { legacyKey: 'users' })).resolves.toMatchObject({
      items: [{ id: 1 }],
      total: 1,
    });
  });

  it('getList transmet le signal et les en-têtes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, []));
    global.fetch = fetchMock;
    const controller = new AbortController();
    await api.getList('/filiales', { signal: controller.signal, headers: { 'X-Test': '1' } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toMatchObject({ 'X-Test': '1', 'X-Requested-With': 'XMLHttpRequest' });
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
    expect(err).toMatchObject({
      status: 502,
      message: 'Serveur momentanément indisponible, réessayez dans quelques instants.',
    });
    expect((err as Error).message).not.toContain('<html>');
  });

  it('corps d’erreur en texte brut (anglais d’un intermédiaire) : jamais affiché, phrase française', async () => {
    global.fetch = vi.fn().mockResolvedValue(rawRes(413, 'Request Entity Too Large'));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 413, message: 'Contenu trop volumineux.' });
    global.fetch = vi.fn().mockResolvedValue(rawRes(500, 'Internal Server Error'));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 500, message: 'Erreur HTTP 500' });
  });

  it('réponse réussie qui n’est pas du JSON (page HTML) : ApiError au message français', async () => {
    global.fetch = vi.fn().mockResolvedValue(rawRes(200, '<!doctype html><html></html>'));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 200, message: UNEXPECTED_RESPONSE_MESSAGE });
  });

  it('serveur injoignable : ApiError de statut 0 au message français, sans « Failed to fetch »', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: NETWORK_ERROR_MESSAGE });
  });

  it('annulation : l’AbortError du navigateur suit son cours', async () => {
    const aborted = new DOMException('Aborted', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(aborted);
    await expect(api.get('/x')).rejects.toBe(aborted);
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
