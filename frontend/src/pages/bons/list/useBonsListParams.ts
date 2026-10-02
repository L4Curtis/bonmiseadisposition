import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useActiveFiliales } from '@/hooks/use-active-filiales';
import { DEFAULT_PAGE_SIZE, isPageSize, PAGE_SIZE_STORAGE_KEY, type PageSize } from '@/hooks/usePagination';
import type { BonListMeta } from '@/contracts/bons';
import type { Bon } from './types';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE } from './statusFilterOptions';
import {
  DEFAULT_LIST_QUERY,
  hasActiveFilters as queryHasFilters,
  nextSort,
  toApiParams,
  toRememberedParams,
  toUrlParams,
  type BonsListQuery,
  type SortField,
} from './bonsListQuery';
import { loadRememberedQuery, saveRememberedQuery } from './rememberedQuery';
import { ignoredFiltersNotice, invertedRanges, readListQuery, withoutInvertedRanges, type ReadListQueryResult } from './readListQuery';

/** Nombre de lignes choisi (25, 50 ou 100), mémorisé dans le navigateur et
 *  commun à toutes les listes (même clé que `usePagination`). */
function readPageSize(): PageSize {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return isPageSize(stored) ? stored : DEFAULT_PAGE_SIZE;
  } catch {
    // Stockage inaccessible (navigation privée) : taille par défaut.
    return DEFAULT_PAGE_SIZE;
  }
}

function writePageSize(size: PageSize): void {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    // Stockage inaccessible : le choix vaut pour la visite en cours.
  }
}

type FilterPatch = Partial<Omit<BonsListQuery, 'page'>>;

/** Message affiché près des dates quand la période saisie est inversée. */
export const DATE_RANGE_ERROR = 'La date de début doit précéder la date de fin : la période n’est pas appliquée.';

/** État initial : l'URL si elle porte quelque chose (lien partagé, tableau de
 *  bord, recherche globale), sinon les derniers filtres mémorisés. Les deux
 *  sources sont vérifiées : une valeur invalide est écartée et signalée. */
function initialRead(searchParams: URLSearchParams): ReadListQueryResult {
  if (searchParams.toString()) return readListQuery(searchParams);
  const remembered = loadRememberedQuery();
  return remembered ? readListQuery(remembered) : { query: DEFAULT_LIST_QUERY, ignored: [] };
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
  const [initial] = useState(() => initialRead(searchParams));
  const [query, setQuery] = useState<BonsListQuery>(initial.query);
  // Filtres écartés à la lecture de l'adresse ou de la mémoire, dits en clair.
  const [notice, setNotice] = useState<string | null>(() => ignoredFiltersNotice(initial.ignored));
  const [searchInput, setSearchInput] = useState(query.search);
  const [pageSize, setPageSizeState] = useState<PageSize>(readPageSize);

  const [bons, setBons] = useState<Bon[]>([]);
  const [total, setTotal] = useState(0);
  // Plafond de l'export annoncé par le serveur (`meta.exportLimit`).
  const [exportLimit, setExportLimit] = useState<number | undefined>(undefined);
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
    const external = readListQuery(new URLSearchParams(urlString));
    setQuery(external.query);
    setSearchInput(external.query.search);
    setNotice(ignoredFiltersNotice(external.ignored));
  }, [urlString]);

  // setSearchParams change d'identité à chaque changement d'URL : lu via une
  // ref pour que l'écriture ne dépende que de l'état (sinon boucle d'écritures).
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const currentUrlRef = useRef(urlString);
  currentUrlRef.current = urlString;

  // Requête réellement appliquée : une période inversée saisie à l'écran reste
  // visible dans ses champs (avec un message) mais n'est ni envoyée au
  // serveur, qui la refuserait, ni écrite dans l'adresse, ni mémorisée.
  const appliedQuery = useMemo(() => withoutInvertedRanges(query), [query]);
  const dateRangeError = invertedRanges(query).includes('mise') ? DATE_RANGE_ERROR : null;

  useEffect(() => {
    const next = toUrlParams(appliedQuery).toString();
    lastWrittenUrl.current = next;
    if (next !== currentUrlRef.current) {
      setSearchParamsRef.current(new URLSearchParams(next), { replace: true });
    }
    saveRememberedQuery(toRememberedParams(appliedQuery));
  }, [appliedQuery]);

  const apiParams = useMemo(() => toApiParams(appliedQuery, pageSize).toString(), [appliedQuery, pageSize]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    // Ignore une réponse arrivée après que l'effet a été relancé (filtres/page
    // changés entre-temps) — la dernière requête lancée doit toujours gagner.
    let ignore = false;
    api
      .getList<Bon, BonListMeta>(`/bons?${apiParams}`)
      .then((data) => {
        if (ignore) return;
        setBons(data.items);
        setTotal(data.total);
        setExportLimit(data.meta?.exportLimit);
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

  /** Change le nombre de lignes (mémorisé) et revient à la page 1. */
  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    writePageSize(size);
    setQuery((q) => ({ ...q, page: 1 }));
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
    setNotice(null);
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

  return {
    query,
    appliedQuery,
    notice,
    dismissNotice: () => setNotice(null),
    dateRangeError,
    bons,
    total,
    exportLimit,
    page: query.page,
    setPage,
    pageSize,
    setPageSize,
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
    hasActiveFilters: queryHasFilters(query),
  };
}
