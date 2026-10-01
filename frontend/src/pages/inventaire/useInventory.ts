import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useActiveFiliales } from '@/hooks/use-active-filiales';
import type { PageSize } from '@/hooks/usePagination';
import {
  buildBaseFilterEntries, readStoredPageSize, storePageSize, type InventoryBaseFilters,
} from './inventoryFilterParams';
import { INVENTORY_SORT_FIELDS } from './types';
import type {
  CompteFilter,
  InventoryItem,
  InventoryListMeta,
  InventorySituation,
  InventorySort,
  InventorySortField,
  InventorySummary,
  InventoryView,
} from './types';

const SITUATIONS: InventorySituation[] = ['en_attente_signature', 'en_circulation', 'en_litige', 'non_restitue'];
const COMPTE_FILTERS: CompteFilter[] = ['actif', 'inactif'];

function readSituation(value: string | null): '' | InventorySituation {
  return SITUATIONS.includes(value as InventorySituation) ? (value as InventorySituation) : '';
}

/** Lot D1 (départ d'un collaborateur) : filtre propre à la vue « Par
 *  collaborateur », jamais transmis à /reporting/inventory ni à l'export CSV —
 *  voir buildFilterEntries ci-dessous, qui ne le lit pas. */
function readCompte(value: string | null): CompteFilter {
  return COMPTE_FILTERS.includes(value as CompteFilter) ? (value as CompteFilter) : '';
}

/** Tri lu depuis l'URL (`sort` + `direction`) : ignoré s'il n'est pas dans la
 *  liste blanche — l'API répondrait 400. Un `direction` seul (ancien lien, où
 *  seule la mise à disposition était triable) vaut tri sur cette colonne. */
function readSort(sort: string | null, direction: string | null): InventorySort | null {
  if (direction !== 'asc' && direction !== 'desc') return null;
  if (sort === null) return { field: 'dateMiseDisposition', direction };
  return (INVENTORY_SORT_FIELDS as readonly string[]).includes(sort)
    ? { field: sort as InventorySortField, direction }
    : null;
}

function readView(value: string | null): InventoryView {
  return value === 'collaborateurs' ? 'collaborateurs' : 'equipements';
}

interface EquipmentFilterState extends InventoryBaseFilters {
  sort: InventorySort | null;
}

/** Couple [clé, valeur] des filtres actifs de la vue par équipement — partagé
 *  par la synchronisation d'URL, le fetch de la liste paginée et l'export CSV,
 *  pour que les trois restent toujours exactement alignés (cf. exigence
 *  « l'export reflète les filtres actifs, quelle que soit la vue »). */
function buildFilterEntries(f: EquipmentFilterState): [string, string][] {
  const entries = buildBaseFilterEntries(f);
  if (f.sort) {
    entries.push(['sort', f.sort.field]);
    entries.push(['direction', f.sort.direction]);
  }
  return entries;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * État + chargement de la page Inventaire : résumé (tuiles), bascule de vue
 * (par équipement / par collaborateur, cf. InventoryViewToggle), liste paginée
 * par équipement avec filtres et tri synchronisés dans l'URL (filialeId,
 * category, search, sansNumeroSerie, horsCatalogue, sort/direction, page, vue),
 * taille de page au choix (25, 50, 100, mémorisée), et chemin de l'export CSV
 * (mêmes filtres, même tri) pour `ExportButton`. La vue « par collaborateur » a son propre
 * chargement (useCollaborateurInventory) mais partage ces mêmes filtres.
 * Isolé de la présentation pour rester testable indépendamment.
 */
export function useInventory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setViewState] = useState<InventoryView>(() => readView(searchParams.get('vue')));
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    setSummaryError(null);
    api
      .get<InventorySummary>('/reporting/inventory/summary')
      .then(setSummary)
      .catch((e: unknown) => setSummaryError(errorMessage(e, 'Impossible de charger le résumé du parc')));
  }, []);
  // Erreur avalée (comportement historique) : en cas d'échec, la liste reste
  // simplement vide plutôt que d'afficher un message dédié à ce filtre.
  const { filiales } = useActiveFiliales();

  const [filialeFilter, setFilialeFilterState] = useState(searchParams.get('filialeId') ?? '');
  const [categoryFilter, setCategoryFilterState] = useState(searchParams.get('category') ?? '');
  const [situationFilter, setSituationFilterState] = useState<'' | InventorySituation>(() =>
    readSituation(searchParams.get('situation')),
  );
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [overdueFilter, setOverdueFilterState] = useState(searchParams.get('overdue') === '1');
  const [missingSerialFilter, setMissingSerialFilterState] = useState(searchParams.get('sansNumeroSerie') === '1');
  const [offCatalogFilter, setOffCatalogFilterState] = useState(searchParams.get('horsCatalogue') === '1');
  const [compteFilter, setCompteFilterState] = useState<CompteFilter>(() => readCompte(searchParams.get('compte')));
  const [sort, setSortState] = useState<InventorySort | null>(() =>
    readSort(searchParams.get('sort'), searchParams.get('direction')),
  );
  const [pageSize, setPageSizeState] = useState<PageSize>(readStoredPageSize);
  /** Plafond de l'export annoncé par le serveur (`meta.exportLimit` de la liste). */
  const [exportLimit, setExportLimit] = useState<number | undefined>(undefined);

  const setView = (value: InventoryView) => { setViewState(value); setPage(1); };
  const setFilialeFilter = (value: string) => { setFilialeFilterState(value); setPage(1); };
  const setCategoryFilter = (value: string) => { setCategoryFilterState(value); setPage(1); };
  const setSituationFilter = (value: string) => { setSituationFilterState(readSituation(value)); setPage(1); };
  const setOverdueFilter = (value: boolean) => { setOverdueFilterState(value); setPage(1); };
  const setMissingSerialFilter = (value: boolean) => { setMissingSerialFilterState(value); setPage(1); };
  const setOffCatalogFilter = (value: boolean) => { setOffCatalogFilterState(value); setPage(1); };
  const setCompteFilter = (value: CompteFilter) => { setCompteFilterState(value); setPage(1); };
  /** Nombre de lignes par page (25, 50 ou 100), mémorisé pour toutes les listes. */
  const setPageSize = (size: PageSize) => { setPageSizeState(size); storePageSize(size); setPage(1); };

  /** Clic sur l'en-tête d'une colonne : une nouvelle colonne part en
   *  croissant, la colonne déjà triée change de sens. Sans tri choisi, la
   *  mise à disposition est implicitement triée en décroissant (ordre par
   *  défaut de l'API) : un clic dessus passe donc en croissant (le plus
   *  ancien prêt d'abord). Retour à la page 1 dans tous les cas. */
  const changeSort = (field: InventorySortField) => {
    setSortState((prev) => {
      const current = prev ?? { field: 'dateMiseDisposition', direction: 'desc' };
      if (current.field !== field) return { field, direction: 'asc' };
      return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
    setPage(1);
  };

  const resetFilters = () => {
    setFilialeFilterState('');
    setCategoryFilterState('');
    setSituationFilterState('');
    setSearchInput('');
    setSearch('');
    setOverdueFilterState(false);
    setMissingSerialFilterState(false);
    setOffCatalogFilterState(false);
    setCompteFilterState('');
    setPage(1);
  };

  const retry = () => setReloadKey((k) => k + 1);

  // ── Référentiel résumé/tuiles ──────────────────────────────────────────────
  // Les filiales actives sont chargées séparément par useActiveFiliales
  // (mutualisées avec les autres filtres/formulaires du même nom) : retry()
  // ne les recharge donc plus explicitement, le cache 60 s suffit.
  useEffect(() => {
    loadSummary();
  }, [reloadKey, loadSummary]);

  // ── Debounce de la recherche texte (300 ms), sans bloquer les autres filtres ──
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // ── Synchronisation URL (filtres + vue + page) et chargement de la liste par
  //    équipement — cette dernière uniquement quand la vue active l'exige : la
  //    vue « par collaborateur » a son propre chargement (useCollaborateurInventory).
  useEffect(() => {
    const filterEntries = buildFilterEntries({
      filialeFilter, categoryFilter, situationFilter, search, overdueFilter, missingSerialFilter, offCatalogFilter, sort,
    });

    const urlParams = Object.fromEntries(filterEntries);
    if (view !== 'equipements') urlParams['vue'] = view;
    // compte (lot D1) : persisté dans l'URL (deep-link tuile tableau de bord /
    // email d'alerte) mais jamais transmis à /reporting/inventory ni à
    // l'export CSV, qui ne le supportent pas — cf. buildFilterEntries plus haut.
    if (compteFilter) urlParams['compte'] = compteFilter;
    if (page > 1) urlParams['page'] = String(page);
    setSearchParams(urlParams, { replace: true });

    if (view !== 'equipements') return;

    setLoading(true);
    setLoadError(null);
    // Un flag d'ignorance protège contre une réponse arrivée après qu'un nouveau
    // filtre a relancé la requête (résultat obsolète qui écraserait le récent).
    let ignore = false;
    const params = new URLSearchParams(filterEntries);
    params.set('page', String(page));
    params.set('limit', String(pageSize));

    api
      .getList<InventoryItem, InventoryListMeta>(`/reporting/inventory?${params}`)
      .then((data) => {
        if (ignore) return;
        setItems(data.items);
        setTotal(data.total);
        if (data.meta) setExportLimit(data.meta.exportLimit);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setItems([]);
        setTotal(0);
        setLoadError(errorMessage(e, "Erreur lors du chargement de l'inventaire"));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearchParams change à chaque navigation : l'ajouter relancerait la requête en boucle.
  }, [filialeFilter, categoryFilter, situationFilter, search, overdueFilter, missingSerialFilter, offCatalogFilter, compteFilter, sort, page, pageSize, reloadKey, view]);

  // Export : mêmes filtres et même tri que la liste par équipement, sans
  // pagination ; une ligne par équipement quelle que soit la vue.
  const exportQuery = new URLSearchParams(
    buildFilterEntries({
      filialeFilter, categoryFilter, situationFilter, search, overdueFilter, missingSerialFilter, offCatalogFilter, sort,
    }),
  ).toString();
  const exportPath = `/reporting/inventory/export${exportQuery ? `?${exportQuery}` : ''}`;

  /** Nombre d'équipements que contiendra l'export, quand la vue affichée
   *  n'en donne pas le total (vue par collaborateur) : `total` d'une page de
   *  la liste par équipement, mêmes filtres. Relève aussi le plafond. */
  const loadExportCount = useCallback(async (signal: AbortSignal): Promise<number> => {
    const params = new URLSearchParams(exportQuery);
    params.set('limit', '25');
    const data = await api.getList<InventoryItem, InventoryListMeta>(`/reporting/inventory?${params}`, { signal });
    if (data.meta) setExportLimit(data.meta.exportLimit);
    return data.total;
  }, [exportQuery]);

  const hasActiveFilters = !!(
    filialeFilter || categoryFilter || situationFilter || search || overdueFilter || missingSerialFilter
    || offCatalogFilter || compteFilter
  );
  const baseFilters: InventoryBaseFilters = {
    filialeFilter, categoryFilter, situationFilter, search, overdueFilter, missingSerialFilter, offCatalogFilter,
  };

  return {
    view,
    setView,
    items,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    loading,
    loadError,
    retry,
    summary,
    summaryError,
    loadSummary,
    filiales,
    filialeFilter,
    setFilialeFilter,
    categoryFilter,
    setCategoryFilter,
    situationFilter,
    setSituationFilter,
    overdueFilter,
    setOverdueFilter,
    missingSerialFilter,
    setMissingSerialFilter,
    offCatalogFilter,
    setOffCatalogFilter,
    compteFilter,
    setCompteFilter,
    sort,
    changeSort,
    searchInput,
    setSearchInput,
    resetFilters,
    exportPath,
    exportLimit,
    loadExportCount,
    hasActiveFilters,
    baseFilters,
  };
}
