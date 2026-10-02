import { BON_STATUS_LABELS, BON_SUB_STATUS_LABELS } from '@/domain/labels';
import {
  DEFAULT_LIST_QUERY,
  EVENT_DAY_KEYS,
  SORT_FIELDS,
  type BonsListQuery,
  type EventDayKey,
  type SortField,
} from './bonsListQuery';

/**
 * Lecture de l'état de la liste des bons depuis une adresse ou depuis les
 * filtres mémorisés dans le navigateur. Tout ce qui en vient est une saisie
 * extérieure (lien abîmé, copié à moitié, ancien format, mémoire d'une
 * version précédente) : chaque valeur est vérifiée ici avec les mêmes règles
 * que le serveur, pour qu'un filtre invalide soit ignoré et signalé au lieu
 * de bloquer la liste sur un refus du serveur.
 */

/** Ce que l'écran a retenu, et le nom en clair des filtres écartés. */
export interface ReadListQueryResult {
  readonly query: BonsListQuery;
  readonly ignored: readonly string[];
}

/** Périodes filtrables, chacune avec ses deux bornes. */
export type RangeKey = 'mise' | 'created' | 'closed' | 'cancelled';

const RANGES: Readonly<Record<RangeKey, { from: DayKey; to: DayKey; label: string }>> = {
  mise: { from: 'dateFrom', to: 'dateTo', label: 'période de mise à disposition' },
  created: { from: 'createdFrom', to: 'createdTo', label: 'période de création' },
  closed: { from: 'closedFrom', to: 'closedTo', label: 'période de clôture' },
  cancelled: { from: 'cancelledFrom', to: 'cancelledTo', label: 'période d’annulation' },
};
const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

type DayKey = 'dateFrom' | 'dateTo' | EventDayKey;

/** Nom de chaque filtre tel que l'utilisateur le comprend (jamais le nom du paramètre). */
const DAY_LABELS: Readonly<Record<DayKey, string>> = {
  dateFrom: 'date de début de mise à disposition',
  dateTo: 'date de fin de mise à disposition',
  createdFrom: 'date de début de création',
  createdTo: 'date de fin de création',
  closedFrom: 'date de début de clôture',
  closedTo: 'date de fin de clôture',
  cancelledFrom: 'date de début d’annulation',
  cancelledTo: 'date de fin d’annulation',
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE_PATTERN = /^BON-\d{4}-\d{4,}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Longueur maximale de la recherche acceptée par le serveur. */
const SEARCH_MAX_LENGTH = 200;

/** Vrai si `value` est une date AAAA-MM-JJ qui existe au calendrier
 *  (refuse 2026-13-45 ou 2026-02-30, comme le serveur). */
export function isRealDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** Liste « a,b,c » de statuts : garde les statuts connus, dans leur ordre. */
function knownStatuses(value: string): string {
  return value.split(',').filter((s) => Object.prototype.hasOwnProperty.call(BON_STATUS_LABELS, s)).join(',');
}

function isSortField(value: string): value is SortField {
  return (SORT_FIELDS as readonly string[]).includes(value);
}

/** Lecteur d'un paramètre texte : absent ou vide → valeur par défaut, sans
 *  remarque ; présent mais refusé par `accept` → valeur par défaut et nom du
 *  filtre ajouté à `ignored`. */
function reader(params: URLSearchParams, ignored: string[]) {
  return <T extends string>(key: string, label: string, accept: (raw: string) => T | null, fallback: T): T => {
    const raw = (params.get(key) ?? '').trim();
    if (!raw) return fallback;
    const value = accept(raw);
    if (value === null) {
      ignored.push(label);
      return fallback;
    }
    return value;
  };
}

function readFlag(params: URLSearchParams, key: string): boolean {
  const value = params.get(key);
  return value === '1' || value === 'true';
}

type Filters = Omit<BonsListQuery, 'sort' | 'order' | 'page'>;

/** Filtres de l'adresse, chacun vérifié ; les noms des filtres écartés sont
 *  ajoutés à `ignored`, dans l'ordre de lecture. */
function readFilters(params: URLSearchParams, ignored: string[]): Filters {
  const read = reader(params, ignored);
  const statusList = (key: string, label: string): string => {
    const raw = (params.get(key) ?? '').trim();
    const kept = raw ? knownStatuses(raw) : '';
    if (kept !== raw) ignored.push(label);
    return kept;
  };
  const day = (key: DayKey) => read(key, DAY_LABELS[key], (v) => (isRealDay(v) ? v : null), '');
  const uuid = (v: string) => (UUID_PATTERN.test(v) ? v : null);
  const isSubStatus = (v: string) => (Object.prototype.hasOwnProperty.call(BON_SUB_STATUS_LABELS, v) ? v : null);

  return {
    search: read('search', 'recherche', (v) => (v.length <= SEARCH_MAX_LENGTH ? v : null), ''),
    reference: read('reference', 'référence du bon', (v) => (REFERENCE_PATTERN.test(v) ? v.toUpperCase() : null), ''),
    status: statusList('status', 'statut'),
    excludeStatus: statusList('excludeStatus', 'statuts exclus'),
    filialeId: read('filialeId', 'filiale', uuid, ''),
    overdue: readFlag(params, 'overdue'),
    awaitingSignature: readFlag(params, 'awaitingSignature'),
    linkExpired: readFlag(params, 'linkExpired'),
    subStatus: read('subStatus', 'étape de la restitution', isSubStatus, ''),
    dateFrom: day('dateFrom'),
    dateTo: day('dateTo'),
    noReturnDate: readFlag(params, 'noReturnDate'),
    createdById: read('createdById', 'créateur du bon', uuid, ''),
    ...(Object.fromEntries(EVENT_DAY_KEYS.map((key) => [key, day(key)])) as Record<EventDayKey, string>),
  };
}

/** Lit l'état depuis l'adresse (ou la mémoire) en écartant chaque valeur que
 *  le serveur refuserait, y compris une période dont le début suit la fin.
 *  Une page invalide revient simplement à la première, sans message. */
export function readListQuery(params: URLSearchParams): ReadListQueryResult {
  const ignored: string[] = [];
  const read = reader(params, ignored);
  const pageParam = Number(params.get('page'));
  const raw: BonsListQuery = {
    ...readFilters(params, ignored),
    sort: DEFAULT_LIST_QUERY.sort,
    order: DEFAULT_LIST_QUERY.order,
    page: Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1,
  };
  for (const range of invertedRanges(raw)) ignored.push(`${RANGES[range].label} (début après la fin)`);
  const query: BonsListQuery = {
    ...withoutInvertedRanges(raw),
    sort: read('sort', 'tri', (v) => (isSortField(v) ? v : null), DEFAULT_LIST_QUERY.sort),
    order: read('order', 'sens du tri', (v) => (v === 'asc' || v === 'desc' ? v : null), DEFAULT_LIST_QUERY.order),
  };
  return { query, ignored };
}

/** État seul, sans la liste des filtres écartés. */
export function parseListQuery(params: URLSearchParams): BonsListQuery {
  return readListQuery(params).query;
}

/** Périodes dont le début suit la fin (bornes au format AAAA-MM-JJ, donc
 *  comparables comme du texte). */
export function invertedRanges(q: BonsListQuery): RangeKey[] {
  return RANGE_KEYS.filter((key) => {
    const from = q[RANGES[key].from];
    const to = q[RANGES[key].to];
    return Boolean(from && to && from > to);
  });
}

/** La requête sans ses périodes inversées : ce qui est réellement envoyé au
 *  serveur, écrit dans l'adresse et mémorisé. Même objet si rien à retirer. */
export function withoutInvertedRanges(q: BonsListQuery): BonsListQuery {
  const inverted = invertedRanges(q);
  if (inverted.length === 0) return q;
  const cleared = Object.fromEntries(inverted.flatMap((key) => [[RANGES[key].from, ''], [RANGES[key].to, '']]));
  return { ...q, ...cleared };
}

/** Message affiché au-dessus de la liste quand des filtres ont été écartés. */
export function ignoredFiltersNotice(ignored: readonly string[]): string | null {
  if (ignored.length === 0) return null;
  if (ignored.length === 1) return `Un filtre n’était pas valide et a été ignoré : ${ignored[0]}.`;
  return `Des filtres n’étaient pas valides et ont été ignorés : ${ignored.join(', ')}.`;
}
