import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { Filiale } from '@/types';
import type { Bon } from './types';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE } from './statusFilterOptions';

const LIMIT = 20;

/** Filtres, pagination et chargement des données de la liste des bons —
 *  état entièrement synchronisé avec l'URL (?search=, ?status=,
 *  ?excludeStatus=, ?overdue=, ?filialeId=) pour rester partageable/rechargeable
 *  et pour accepter les filtres hérités du tableau de bord. */
export function useBonsListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [bons, setBons] = useState<Bon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filiales, setFiliales] = useState<Filiale[]>([]);

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [excludeStatus, setExcludeStatus] = useState(searchParams.get('excludeStatus') ?? '');
  const [overdue, setOverdue] = useState(searchParams.get('overdue') === '1');
  const [filialeFilter, setFilialeFilter] = useState(searchParams.get('filialeId') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [exportLoading, setExportLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const resetFilters = () => {
    setSearch('');
    setSearchInput('');
    setStatusFilter('');
    setExcludeStatus('');
    setOverdue(false);
    setFilialeFilter('');
    setPage(1);
  };

  // Valeur affichée dans le select statut : les options composites pilotées
  // par excludeStatus (pas par status) sont mappées vers leur valeur factice.
  const statusSelectValue = !statusFilter && excludeStatus === IN_PROGRESS_EXCLUDE
    ? IN_PROGRESS_OPTION_VALUE
    : statusFilter;

  const handleStatusSelect = (value: string) => {
    if (value.startsWith('__exclude:')) {
      setStatusFilter('');
      setExcludeStatus(value.slice('__exclude:'.length));
    } else {
      // Un statut explicite retire le filtre « en cours » hérité du dashboard
      setStatusFilter(value);
      setExcludeStatus('');
    }
    setPage(1);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (excludeStatus) params.set('excludeStatus', excludeStatus);
      if (overdue) params.set('overdue', '1');
      if (filialeFilter) params.set('filialeId', filialeFilter);
      const blob = await api.getBlob(`/bons/export?${params}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export CSV.");
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales).catch(() => {});
  }, []);

  // Resynchronise l'état depuis l'URL quand ?search= change SANS remontage
  // (cas : recherche globale Ctrl+K du header alors qu'on est déjà sur /bons —
  // le composant ne se remonte pas, les useState initiaux ne se relisent pas).
  // Pas de boucle avec l'effet d'écriture ci-dessous : urlSearch est une string,
  // une réécriture à valeur identique ne re-déclenche pas cet effet.
  const urlSearch = searchParams.get('search') ?? '';
  useEffect(() => {
    setSearch(urlSearch);
    setSearchInput(urlSearch);
    setPage(1);
  }, [urlSearch]);

  useEffect(() => {
    const urlParams: Record<string, string> = {};
    if (search) urlParams['search'] = search;
    if (statusFilter) urlParams['status'] = statusFilter;
    if (excludeStatus) urlParams['excludeStatus'] = excludeStatus;
    if (overdue) urlParams['overdue'] = '1';
    if (filialeFilter) urlParams['filialeId'] = filialeFilter;
    setSearchParams(urlParams, { replace: true });

    setLoading(true);
    setLoadError(null);
    // Ignore une réponse arrivée après que l'effet a été relancé (filtres/page
    // changés entre-temps) — la dernière requête lancée doit toujours gagner.
    let ignore = false;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (excludeStatus) params.set('excludeStatus', excludeStatus);
    if (overdue) params.set('overdue', '1');
    if (filialeFilter) params.set('filialeId', filialeFilter);
    params.set('page', String(page));
    params.set('limit', String(LIMIT));

    api
      .get<{ bons: Bon[]; total: number }>(`/bons?${params}`)
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
  }, [search, statusFilter, excludeStatus, overdue, filialeFilter, page, reloadKey]);

  const totalPages = Math.ceil(total / LIMIT);
  const hasActiveFilters = !!(search || statusFilter || excludeStatus || overdue || filialeFilter);
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const rangeEnd = Math.min(page * LIMIT, total);

  return {
    bons,
    total,
    page,
    setPage,
    loading,
    loadError,
    filiales,
    search,
    searchInput,
    setSearchInput,
    setSearch,
    statusFilter,
    excludeStatus,
    overdue,
    setOverdue,
    filialeFilter,
    setFilialeFilter,
    exportLoading,
    resetFilters,
    statusSelectValue,
    handleStatusSelect,
    handleExport,
    setExcludeStatus,
    setReloadKey,
    totalPages,
    hasActiveFilters,
    rangeStart,
    rangeEnd,
  };
}
