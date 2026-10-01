import { vi, type Mock } from 'vitest';
import { toListResponse, type ListReadOptions } from '@/lib/api-envelope';

/**
 * `api.getList` d'un module `@/lib/api` simulé, branché sur le `api.get`
 * simulé du même test : une liste se décrit comme les autres réponses
 * (`vi.mocked(api.get).mockImplementation(...)`), dans sa forme commune
 * `{ items, total, page, limit, truncated, meta? }` ou un tableau, et passe
 * par la même lecture que le vrai client (`toListResponse`).
 *
 *   vi.mock('@/lib/api', async (importOriginal) => {
 *     const actual = await importOriginal<typeof import('@/lib/api')>();
 *     const { listViaGet } = await import('@/test/api-mock');
 *     const get = vi.fn();
 *     return { ...actual, api: { get, getList: listViaGet(get), post: vi.fn() } };
 *   });
 */
export function listViaGet(get: Mock): Mock {
  return vi.fn((path: string, options?: ListReadOptions) =>
    Promise.resolve()
      .then(() => get(path))
      .then((body: unknown) => toListResponse(body, options)),
  );
}

/** Réponse d'une liste complète, à la forme commune de l'API. */
export function listOf<T, M = never>(items: readonly T[], meta?: M) {
  return {
    items: [...items],
    total: items.length,
    page: 1,
    limit: items.length,
    truncated: false,
    ...(meta === undefined ? {} : { meta }),
  };
}
