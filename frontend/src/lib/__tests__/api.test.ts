import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api';

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
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
});
