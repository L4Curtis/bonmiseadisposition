/**
 * Listes de l'API : pagination commune et forme unique de réponse. Voir
 * docs/api-conventions.md § Listes.
 */
export {
  DEFAULT_PAGE_SIZE,
  LARGE_PAGE_SIZES,
  LargePaginationQueryDto,
  PAGE_SIZES,
  PaginationQueryDto,
  toPrismaPage,
} from './pagination.dto';
export type { PageRequest } from './pagination.dto';
export { toFullListResponse, toListResponse } from './list-response';
export type { ListPage } from './list-response';
