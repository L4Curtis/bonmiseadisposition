import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { useActiveFiliales } from '@/hooks/use-active-filiales';
import { buildBaseFilterEntries, PAGE_LIMIT, type InventoryBaseFilters } from './inventoryFilterParams';
import type {
  EquipmentSituation,
  InventoryItem,
  InventoryListResponse,
  InventorySummary,
  InventoryView,
  SortDirection,
} from './types';

const SITUATIONS: EquipmentSituation[] = ['en_attente_signature', 'en_circulation', 'en_litige'];

function readSituation(value: string | null): '' | EquipmentSituation {
  return SITUATIONS.includes(value as EquipmentSituation) ? (value as EquipmentSituation) : '';
}

function readDirection(value: string | null): '' | SortDirection {
  return value === 'asc' || value === 'desc' ? value : '';
}

function readView(value: string | null): InventoryView {
  return value === 'collaborateurs' ? 'collaborateurs' : 'equipements';
}

interface EquipmentFilterState extends InventoryBaseFilters {
  sortDirection: '' | SortDirection;
}

/** Couple [clé, valeur] des filtres actifs de la vue par équipement — partagé
 *  par la synchronisation d'URL, le fetch de la liste paginée et l'export CSV,
 *  pour que les trois restent toujours exactement alignés (cf. exigence
 *  « l'export reflète les filtres actifs, quelle que soit la vue »). */
function buildFilterEntries(f: EquipmentFilterState): [string, string][] {
  const entries = buildBaseFilterEntries(f);
  if (f.sortDirection) {
    entries.push(['sort', 'dateMiseDisposition']);
    entries.push(['direction', f.sortDirection]);
  }
  return entries;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * État + chargement de la page Inventaire : résumé (tuiles), bascule de vue
 * (par équipement / par collaborateur, cf. InventoryViewToggle), liste paginée
 * par équipement avec filtres synchronisés dans l'URL (filialeId, category,
 * search, page, vue), et export CSV. La vue « par collaborateur » a son propre
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
  const [situationFilter, setSituationFilterState] = useState<'' | EquipmentSituation>(() =>
    readSituation(searchParams.get('situation')),
  );
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [overdueFilter, setOverdueFilterState] = useState(searchParams.get('overdue') === '1');
  const [sortDirection, setSortDirectionState] = useState<'' | SortDirection>(() =>
    readDirection(searchParams.get('direction')),
  );
  const [exportLoading, setExportLoading] = useState(false);

  const setView = (value: InventoryView) => { setViewState(value); setPage(1); };
  const setFilialeFilter = (value: string) => { setFilialeFilterState(value); setPage(1); };
  const setCategoryFilter = (value: string) => { setCategoryFilterState(value); setPage(1); };
  const setSituationFilter = (value: string) => { setSituationFilterState(readSituation(value)); setPage(1); };
  const setOverdueFilter = (value: boolean) => { setOverdueFilterState(value); setPage(1); };

  /** Bascule le sens de tri de la colonne « Mise à disposition » (ancienneté).
   *  Le premier clic part du sens implicite par défaut (desc, le plus récent
   *  d'abord côté API) et bascule vers asc (le plus ancien d'abord). */
  const toggleDateSort = () => {
    setSortDirectionState((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  };

  const resetFilters = () => {
    setFilialeFilterState('');
    setCategoryFilterState('');
    setSituationFilterState('');
    setSearchInput('');
    setSearch('');
    setOverdueFilterState(false);
    setPage(1);
  };

  const retry = () => setReloadKey((k) => k + 1);

  // ── Référentiel résumé/tuiles ──────────────────────────────────────────────
  // Les filiales actives sont chargées séparément par useActiveFiliales
  // (mutualisées avec les autres filtres/formulaires du même nom) : retry()
  // ne les recharge donc plus explicitement, le cache 60 s suffit.
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

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
      filialeFilter, categoryFilter, situationFilter, search, overdueFilter, sortDirection,
    });

    const urlParams = Object.fromEntries(filterEntries);
    if (view !== 'equipements') urlParams['vue'] = view;
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
    params.set('limit', String(PAGE_LIMIT));

    api
      .get<InventoryListResponse>(`/reporting/inventory?${params}`)
      .then((data) => {
        if (ignore) return;
        setItems(data.items);
        setTotal(data.total);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filialeFilter, categoryFilter, situationFilter, search, overdueFilter, sortDirection, page, reloadKey, view]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams(
        buildFilterEntries({ filialeFilter, categoryFilter, situationFilter, search, overdueFilter, sortDirection }),
      );
      const blob = await api.getBlob(`/reporting/inventory/export?${params}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventaire-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export CSV.");
    } finally {
      setExportLoading(false);
    }
  };

  const hasActiveFilters = !!(filialeFilter || categoryFilter || situationFilter || search || overdueFilter);
  const baseFilters: InventoryBaseFilters = { filialeFilter, categoryFilter, situationFilter, search, overdueFilter };

  return {
    view,
    setView,
    items,
    total,
    page,
    setPage,
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
    sortDirection,
    toggleDateSort,
    searchInput,
    setSearchInput,
    resetFilters,
    exportLoading,
    handleExport,
    hasActiveFilters,
    baseFilters,
  };
}
