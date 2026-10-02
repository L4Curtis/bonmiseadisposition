/**
 * État de la liste des bons (filtres, tri, page) et sa traduction en URL et en
 * paramètres d'API. Fonctions pures : l'URL est la forme partageable de cet
 * état (lien copié, retour arrière, liens du tableau de bord), et la valeur
 * par défaut d'un champ n'y figure jamais, pour garder des URL courtes. La
 * lecture inverse (adresse ou mémoire → état, valeurs vérifiées) est dans
 * `readListQuery.ts`.
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
  /** Référence exacte (BON-AAAA-NNNN) : un seul bon, jamais ses voisins. */
  readonly reference: string;
  /** Un statut ou une liste « a,b,c ». */
  readonly status: string;
  readonly excludeStatus: string;
  readonly filialeId: string;
  readonly overdue: boolean;
  /** « Signature attendue » : même prédicat que la tuile de l'accueil. */
  readonly awaitingSignature: boolean;
  /** « Lien expiré » : même prédicat que la tuile de l'accueil. */
  readonly linkExpired: boolean;
  /** Sous-état de « Restitution en cours » (valeur de `BonSubStatus`, '' = tous). */
  readonly subStatus: string;
  /** Période sur la date de mise à disposition (AAAA-MM-JJ, bornes incluses). */
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly noReturnDate: boolean;
  readonly createdById: string;
  /** Créés / clôturés / annulés sur une période (jours de Paris, AAAA-MM-JJ,
   *  bornes incluses) : liens des listes du tableau de bord. */
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly closedFrom: string;
  readonly closedTo: string;
  readonly cancelledFrom: string;
  readonly cancelledTo: string;
  readonly sort: SortField;
  readonly order: SortOrder;
  readonly page: number;
}

export const DEFAULT_LIST_QUERY: BonsListQuery = {
  search: '',
  reference: '',
  status: '',
  excludeStatus: '',
  filialeId: '',
  overdue: false,
  awaitingSignature: false,
  linkExpired: false,
  subStatus: '',
  dateFrom: '',
  dateTo: '',
  noReturnDate: false,
  createdById: '',
  createdFrom: '',
  createdTo: '',
  closedFrom: '',
  closedTo: '',
  cancelledFrom: '',
  cancelledTo: '',
  sort: 'createdAt',
  order: 'desc',
  page: 1,
};

/** Périodes d'événement lues et écrites telles quelles dans l'adresse. */
export const EVENT_DAY_KEYS = [
  'createdFrom', 'createdTo', 'closedFrom', 'closedTo', 'cancelledFrom', 'cancelledTo',
] as const;
export type EventDayKey = (typeof EVENT_DAY_KEYS)[number];

/** Filtres seuls (sans tri ni page), dans l'ordre stable de l'URL. */
function filterEntries(q: BonsListQuery): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (q.search) entries.push(['search', q.search]);
  if (q.reference) entries.push(['reference', q.reference]);
  if (q.status) entries.push(['status', q.status]);
  if (q.excludeStatus) entries.push(['excludeStatus', q.excludeStatus]);
  if (q.overdue) entries.push(['overdue', '1']);
  if (q.awaitingSignature) entries.push(['awaitingSignature', '1']);
  if (q.linkExpired) entries.push(['linkExpired', '1']);
  if (q.subStatus) entries.push(['subStatus', q.subStatus]);
  if (q.filialeId) entries.push(['filialeId', q.filialeId]);
  if (q.dateFrom) entries.push(['dateFrom', q.dateFrom]);
  if (q.dateTo) entries.push(['dateTo', q.dateTo]);
  if (q.noReturnDate) entries.push(['noReturnDate', '1']);
  if (q.createdById) entries.push(['createdById', q.createdById]);
  for (const key of EVENT_DAY_KEYS) if (q[key]) entries.push([key, q[key]]);
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

/** Filtres posés par un lien (tableau de bord, recherche globale) et sans
 *  champ à l'écran : ils valent pour la visite, pas pour la suivante. */
const LINK_ONLY_KEYS: ReadonlySet<string> = new Set(['reference', ...EVENT_DAY_KEYS]);

/** Forme mémorisée dans le navigateur : filtres choisis à l'écran et tri.
 *  Jamais la page (revenir à la liste sur la page 4 d'une recherche d'hier
 *  n'aurait pas de sens), ni la référence exacte ou les périodes d'un lien du
 *  tableau de bord (revenir par le menu « Bons » afficherait sinon une liste
 *  filtrée sans qu'on l'ait demandé). */
export function toRememberedParams(q: BonsListQuery): URLSearchParams {
  const filters = filterEntries(q).filter(([key]) => !LINK_ONLY_KEYS.has(key));
  return new URLSearchParams([...filters, ...sortEntries(q)]);
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
