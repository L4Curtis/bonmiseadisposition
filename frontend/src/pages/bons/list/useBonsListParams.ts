import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useActiveFiliales } from '@/hooks/use-active-filiales';
import type { Bon } from './types';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE } from './statusFilterOptions';
import {
  DEFAULT_LIST_QUERY,
  hasActiveFilters as queryHasFilters,
  nextSort,
  parseListQuery,
  toApiParams,
  toRememberedParams,
  toUrlParams,
  type BonsListQuery,
  type SortField,
} from './bonsListQuery';
import { loadRememberedQuery, saveRememberedQuery } from './rememberedQuery';

export const LIST_PAGE_SIZE = 20;

type FilterPatch = Partial<Omit<BonsListQuery, 'page'>>;

/** État initial : l'URL si elle porte quelque chose (lien partagé, tableau de
 *  bord, recherche globale), sinon les derniers filtres mémorisés. */
function initialQuery(searchParams: URLSearchParams): BonsListQuery {
  if (searchParams.toString()) return parseListQuery(searchParams);
  const remembered = loadRememberedQuery();
  return remembered ? parseListQuery(remembered) : DEFAULT_LIST_QUERY;
}

/** Filtres, tri, pagination et chargement de la liste des bons. L'état vit
 *  dans React (mises à jour successives fiables dans un même gestionnaire) et
 *  il est recopié dans l'URL (?search=, ?status=, ?sort=, ?page=…) pour rester
 *  partageable et rechargeable ; un changement d'URL venu d'ailleurs
 *  (recherche globale Ctrl+K, lien du tableau de bord alors que la liste est
 *  déjà affichée) est relu dans l'état. Les filtres et le tri sont aussi
 *  mémorisés dans le navigateur (rememberedQuery). */
export function useBonsListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState<BonsListQuery>(() => initialQuery(searchParams));
  const [searchInput, setSearchInput] = useState(query.search);

  const [bons, setBons] = useState<Bon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Erreur avalée (comportement historique) : en cas d'échec, le filtre
  // filiale reste simplement vide plutôt que d'afficher un message dédié.
  const { filiales } = useActiveFiliales();

  // Dernière forme d'URL écrite par ce hook : distingue nos propres écritures
  // d'une navigation extérieure, seule à devoir être relue dans l'état.
  const lastWrittenUrl = useRef<string | null>(null);
  const urlString = searchParams.toString();

  useEffect(() => {
    if (lastWrittenUrl.current === null || urlString === lastWrittenUrl.current) return;
    const external = parseListQuery(new URLSearchParams(urlString));
    setQuery(external);
    setSearchInput(external.search);
  }, [urlString]);

  // setSearchParams change d'identité à chaque changement d'URL : lu via une
  // ref pour que l'écriture ne dépende que de l'état (sinon boucle d'écritures).
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const currentUrlRef = useRef(urlString);
  currentUrlRef.current = urlString;

  useEffect(() => {
    const next = toUrlParams(query).toString();
    lastWrittenUrl.current = next;
    if (next !== currentUrlRef.current) {
      setSearchParamsRef.current(new URLSearchParams(next), { replace: true });
    }
    saveRememberedQuery(toRememberedParams(query));
  }, [query]);

  const apiParams = useMemo(() => toApiParams(query, LIST_PAGE_SIZE).toString(), [query]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    // Ignore une réponse arrivée après que l'effet a été relancé (filtres/page
    // changés entre-temps) — la dernière requête lancée doit toujours gagner.
    let ignore = false;
    api
      .get<{ bons: Bon[]; total: number }>(`/bons?${apiParams}`)
      .then((data) => {
        if (ignore) return;
        setBons(data.bons);
        setTotal(data.total);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        // Une panne serveur ne doit pas s'afficher comme « aucun bon »
        setBons([]);
        setTotal(0);
        setLoadError(errorMessage(e, 'Erreur lors du chargement des bons'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [apiParams, reloadKey]);

  /** Tout changement de filtre ou de tri revient à la page 1. */
  const updateFilters = useCallback((patch: FilterPatch) => {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((next: number | ((page: number) => number)) => {
    setQuery((q) => ({ ...q, page: Math.max(1, typeof next === 'function' ? next(q.page) : next) }));
  }, []);

  /** Remplace tout l'état (vue rapide) ; la saisie de recherche suit. */
  const applyQuery = useCallback((next: BonsListQuery) => {
    setQuery({ ...next, page: 1 });
    setSearchInput(next.search);
  }, []);

  const resetFilters = useCallback(() => {
    // Le tri choisi est conservé : « réinitialiser » vise les filtres.
    setQuery((q) => ({ ...DEFAULT_LIST_QUERY, sort: q.sort, order: q.order }));
    setSearchInput('');
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    setQuery((q) => ({ ...q, ...nextSort(q, field), page: 1 }));
  }, []);

  // Valeur affichée dans le select statut : les options composites pilotées
  // par excludeStatus (pas par status) sont mappées vers leur valeur factice.
  const statusSelectValue = !query.status && query.excludeStatus === IN_PROGRESS_EXCLUDE
    ? IN_PROGRESS_OPTION_VALUE
    : query.status;

  const handleStatusSelect = useCallback((value: string) => {
    if (value.startsWith('__exclude:')) {
      updateFilters({ status: '', excludeStatus: value.slice('__exclude:'.length) });
    } else {
      // Un statut explicite retire le filtre « en cours » hérité du dashboard
      updateFilters({ status: value, excludeStatus: '' });
    }
  }, [updateFilters]);

  const totalPages = Math.ceil(total / LIST_PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : (query.page - 1) * LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(query.page * LIST_PAGE_SIZE, total);

  return {
    query,
    bons,
    total,
    page: query.page,
    setPage,
    loading,
    loadError,
    filiales,
    search: query.search,
    searchInput,
    setSearchInput,
    setSearch: (value: string) => updateFilters({ search: value }),
    statusFilter: query.status,
    excludeStatus: query.excludeStatus,
    setExcludeStatus: (value: string) => updateFilters({ excludeStatus: value }),
    overdue: query.overdue,
    setOverdue: (value: boolean) => updateFilters({ overdue: value }),
    filialeFilter: query.filialeId,
    setFilialeFilter: (value: string) => updateFilters({ filialeId: value }),
    updateFilters,
    applyQuery,
    toggleSort,
    resetFilters,
    statusSelectValue,
    handleStatusSelect,
    reload: () => setReloadKey((k) => k + 1),
    totalPages,
    hasActiveFilters: queryHasFilters(query),
    rangeStart,
    rangeEnd,
  };
}
