import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { Filiale } from '@/types';
import type { EquipmentSituation, InventoryItem, InventoryListResponse, InventorySummary } from './types';

const SITUATIONS: EquipmentSituation[] = ['en_attente_signature', 'en_circulation', 'en_litige'];

function readSituation(value: string | null): '' | EquipmentSituation {
  return SITUATIONS.includes(value as EquipmentSituation) ? (value as EquipmentSituation) : '';
}

const LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * État + chargement de la page Inventaire : résumé (tuiles), liste paginée
 * avec filtres synchronisés dans l'URL (filialeId, category, search, page),
 * et export CSV. Isolé de la présentation pour rester testable indépendamment.
 */
export function useInventory() {
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [filiales, setFiliales] = useState<Filiale[]>([]);

  const [filialeFilter, setFilialeFilterState] = useState(searchParams.get('filialeId') ?? '');
  const [categoryFilter, setCategoryFilterState] = useState(searchParams.get('category') ?? '');
  const [situationFilter, setSituationFilterState] = useState<'' | EquipmentSituation>(() =>
    readSituation(searchParams.get('situation')),
  );
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [exportLoading, setExportLoading] = useState(false);

  const setFilialeFilter = (value: string) => { setFilialeFilterState(value); setPage(1); };
  const setCategoryFilter = (value: string) => { setCategoryFilterState(value); setPage(1); };
  const setSituationFilter = (value: string) => { setSituationFilterState(readSituation(value)); setPage(1); };

  const resetFilters = () => {
    setFilialeFilterState('');
    setCategoryFilterState('');
    setSituationFilterState('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const retry = () => setReloadKey((k) => k + 1);

  // ── Référentiels (filiales, résumé/tuiles + options de catégorie) ──────────
  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales).catch(() => {});
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

  // ── Chargement de la liste paginée ──────────────────────────────────────────
  useEffect(() => {
    const urlParams: Record<string, string> = {};
    if (filialeFilter) urlParams['filialeId'] = filialeFilter;
    if (categoryFilter) urlParams['category'] = categoryFilter;
    if (situationFilter) urlParams['situation'] = situationFilter;
    if (search) urlParams['search'] = search;
    if (page > 1) urlParams['page'] = String(page);
    setSearchParams(urlParams, { replace: true });

    setLoading(true);
    setLoadError(null);
    // Un flag d'ignorance protège contre une réponse arrivée après qu'un nouveau
    // filtre a relancé la requête (résultat obsolète qui écraserait le récent).
    let ignore = false;
    const params = new URLSearchParams();
    if (filialeFilter) params.set('filialeId', filialeFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (situationFilter) params.set('situation', situationFilter);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));

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
  }, [filialeFilter, categoryFilter, situationFilter, search, page, reloadKey]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (filialeFilter) params.set('filialeId', filialeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (situationFilter) params.set('situation', situationFilter);
      if (search) params.set('search', search);
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

  const totalPages = Math.ceil(total / LIMIT);
  const hasActiveFilters = !!(filialeFilter || categoryFilter || situationFilter || search);
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const rangeEnd = Math.min(page * LIMIT, total);

  return {
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
    searchInput,
    setSearchInput,
    resetFilters,
    exportLoading,
    handleExport,
    totalPages,
    hasActiveFilters,
    rangeStart,
    rangeEnd,
  };
}
