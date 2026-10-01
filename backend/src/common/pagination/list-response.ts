import type { ListResponse } from '../../contracts/common';

export interface ListPage<M> {
  /** Nombre d'éléments correspondant aux filtres, toutes pages confondues. */
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  /** La liste a été coupée à un plafond (faux par défaut). */
  readonly truncated?: boolean;
  /** Données annexes propres à la route (`openCount`, `exportLimit`…). */
  readonly meta?: M;
}

/**
 * Construit la réponse d'une liste paginée, à la forme unique
 * `{ items, total, page, limit, truncated, meta? }` :
 *
 *   const [rows, total] = await Promise.all([findMany({ ...toPrismaPage(query) }), count()]);
 *   return toListResponse(rows, { total, page: query.page, limit: query.limit });
 */
export function toListResponse<T, M = never>(items: readonly T[], page: ListPage<M>): ListResponse<T, M> {
  return {
    items: [...items],
    total: page.total,
    page: page.page,
    limit: page.limit,
    truncated: page.truncated ?? false,
    ...(page.meta !== undefined ? { meta: page.meta } : {}),
  };
}

/** Liste toujours complète (petit référentiel : filiales, catalogue, packs) :
 *  même forme, en une seule page. */
export function toFullListResponse<T, M = never>(items: readonly T[], meta?: M): ListResponse<T, M> {
  return toListResponse(items, { total: items.length, page: 1, limit: items.length, meta });
}
