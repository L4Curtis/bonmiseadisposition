/**
 * État de la liste des bons (filtres, tri, page) et sa traduction en URL et en
 * paramètres d'API. Fonctions pures : l'URL est la forme partageable de cet
 * état (lien copié, retour arrière, liens du tableau de bord), et la valeur
 * par défaut d'un champ n'y figure jamais, pour garder des URL courtes.
 */

/** Champs triables — même liste blanche que le backend (bons/queries/bon-order). */
export const SORT_FIELDS = [
  'reference',
  'dateMiseDisposition',
  'createdAt',
  'updatedAt',
  'status',
  'collaborateur',
  'filiale',
] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** Sens appliqué au premier clic sur un en-tête : les dates du plus récent au
 *  plus ancien, les textes dans l'ordre alphabétique. */
const FIRST_CLICK_ORDER: Record<SortField, SortOrder> = {
  reference: 'asc',
  dateMiseDisposition: 'desc',
  createdAt: 'desc',
  updatedAt: 'desc',
  status: 'asc',
  collaborateur: 'asc',
  filiale: 'asc',
};

export interface BonsListQuery {
  readonly search: string;
  /** Un statut ou une liste « a,b,c ». */
  readonly status: string;
  readonly excludeStatus: string;
  readonly filialeId: string;
  readonly overdue: boolean;
  /** Période sur la date de mise à disposition (AAAA-MM-JJ, bornes incluses). */
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly noReturnDate: boolean;
  readonly createdById: string;
  readonly sort: SortField;
  readonly order: SortOrder;
  readonly page: number;
}

export const DEFAULT_LIST_QUERY: BonsListQuery = {
  search: '',
  status: '',
  excludeStatus: '',
  filialeId: '',
  overdue: false,
  dateFrom: '',
  dateTo: '',
  noReturnDate: false,
  createdById: '',
  sort: 'createdAt',
  order: 'desc',
  page: 1,
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isSortField(value: string | null): value is SortField {
  return value !== null && (SORT_FIELDS as readonly string[]).includes(value);
}

function readDay(params: URLSearchParams, key: string): string {
  const value = params.get(key) ?? '';
  return DAY_PATTERN.test(value) ? value : '';
}

function readFlag(params: URLSearchParams, key: string): boolean {
  const value = params.get(key);
  return value === '1' || value === 'true';
}

/** Lit l'état depuis l'URL. Une valeur invalide (tri inconnu, date mal formée,
 *  page négative — lien bricolé ou ancien) retombe sur la valeur par défaut
 *  plutôt que de provoquer un 400 côté API. */
export function parseListQuery(params: URLSearchParams): BonsListQuery {
  const sortParam = params.get('sort');
  const orderParam = params.get('order');
  const pageParam = Number(params.get('page'));
  return {
    search: params.get('search') ?? '',
    status: params.get('status') ?? '',
    excludeStatus: params.get('excludeStatus') ?? '',
    filialeId: params.get('filialeId') ?? '',
    overdue: readFlag(params, 'overdue'),
    dateFrom: readDay(params, 'dateFrom'),
    dateTo: readDay(params, 'dateTo'),
    noReturnDate: readFlag(params, 'noReturnDate'),
    createdById: params.get('createdById') ?? '',
    sort: isSortField(sortParam) ? sortParam : DEFAULT_LIST_QUERY.sort,
    order: orderParam === 'asc' || orderParam === 'desc' ? orderParam : DEFAULT_LIST_QUERY.order,
    page: Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1,
  };
}

/** Filtres seuls (sans tri ni page), dans l'ordre stable de l'URL. */
function filterEntries(q: BonsListQuery): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (q.search) entries.push(['search', q.search]);
  if (q.status) entries.push(['status', q.status]);
  if (q.excludeStatus) entries.push(['excludeStatus', q.excludeStatus]);
  if (q.overdue) entries.push(['overdue', '1']);
  if (q.filialeId) entries.push(['filialeId', q.filialeId]);
  if (q.dateFrom) entries.push(['dateFrom', q.dateFrom]);
  if (q.dateTo) entries.push(['dateTo', q.dateTo]);
  if (q.noReturnDate) entries.push(['noReturnDate', '1']);
  if (q.createdById) entries.push(['createdById', q.createdById]);
  return entries;
}

function sortEntries(q: BonsListQuery): Array<[string, string]> {
  const isDefault = q.sort === DEFAULT_LIST_QUERY.sort && q.order === DEFAULT_LIST_QUERY.order;
  return isDefault ? [] : [['sort', q.sort], ['order', q.order]];
}

/** Forme URL de l'état (valeurs par défaut omises). */
export function toUrlParams(q: BonsListQuery): URLSearchParams {
  const entries = [...filterEntries(q), ...sortEntries(q)];
  if (q.page > 1) entries.push(['page', String(q.page)]);
  return new URLSearchParams(entries);
}

/** Forme mémorisée dans le navigateur : filtres et tri, jamais la page (revenir
 *  à la liste sur la page 4 d'une recherche d'hier n'aurait pas de sens). */
export function toRememberedParams(q: BonsListQuery): URLSearchParams {
  return new URLSearchParams([...filterEntries(q), ...sortEntries(q)]);
}

/** Paramètres de `GET /bons` (liste paginée). */
export function toApiParams(q: BonsListQuery, limit: number): URLSearchParams {
  const params = new URLSearchParams([...filterEntries(q), ['sort', q.sort], ['order', q.order]]);
  params.set('page', String(q.page));
  params.set('limit', String(limit));
  return params;
}

/** Paramètres de `GET /bons/export` : mêmes filtres et même tri que la liste
 *  affichée, ou la seule sélection quand `ids` est fourni. */
export function toExportParams(q: BonsListQuery, ids?: readonly string[]): URLSearchParams {
  const base: Array<[string, string]> = ids?.length ? [['ids', ids.join(',')]] : filterEntries(q);
  return new URLSearchParams([...base, ['sort', q.sort], ['order', q.order]]);
}

export function hasActiveFilters(q: BonsListQuery): boolean {
  return filterEntries(q).length > 0;
}

/** Tri après un clic sur l'en-tête `field` : inverse le sens si la colonne
 *  est déjà triée, sinon applique son sens naturel. */
export function nextSort(q: BonsListQuery, field: SortField): { sort: SortField; order: SortOrder } {
  if (q.sort === field) return { sort: field, order: q.order === 'asc' ? 'desc' : 'asc' };
  return { sort: field, order: FIRST_CLICK_ORDER[field] };
}
