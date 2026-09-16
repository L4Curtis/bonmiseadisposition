import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { todayInParis } from '@/lib/kpi-period';
import { StatusBadge } from '@/components/StatusBadge';
import type { BonStatus, Filiale } from '@/types';
import {
  Boxes,
  Package,
  AlertTriangle,
  Layers,
  Building2,
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryCollaborateur {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
}

interface InventoryFiliale {
  id: string;
  name: string;
  displayName: string;
}

interface InventoryItem {
  equipmentId: string;
  label: string;
  category: string;
  categoryLabel?: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  bonId: string;
  bonReference: string;
  bonStatus: BonStatus;
  dateMiseDisposition: string;
  dateRestitution: string | null;
  collaborateur: InventoryCollaborateur;
  filiale: InventoryFiliale;
}

interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

interface InventoryCategorySummary {
  category: string;
  label: string;
  count: number;
}

interface InventoryFilialeSummary {
  filialeId: string;
  name: string;
  count: number;
}

interface InventorySummary {
  total: number;
  byCategory: InventoryCategorySummary[];
  byFiliale: InventoryFilialeSummary[];
  overdue: number;
}

const LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dateRestitution: string | null): boolean {
  if (!dateRestitution) return false;
  return dateRestitution.slice(0, 10) < todayInParis();
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-32 hidden lg:block" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function InventairePage() {
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

  const [filialeFilter, setFilialeFilter] = useState(searchParams.get('filialeId') ?? '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [exportLoading, setExportLoading] = useState(false);

  const resetFilters = () => {
    setFilialeFilter('');
    setCategoryFilter('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  // ── Référentiels (filiales, résumé/tuiles + options de catégorie) ──────────
  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales).catch(() => {});
    loadSummary();
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
  }, [filialeFilter, categoryFilter, search, page, reloadKey]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (filialeFilter) params.set('filialeId', filialeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
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
  const hasActiveFilters = !!(filialeFilter || categoryFilter || search);
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const rangeEnd = Math.min(page * LIMIT, total);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Boxes className="h-5 w-5" /> Inventaire du parc prêté
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Équipements actuellement entre les mains des collaborateurs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exportLoading}>
          {exportLoading ? (
            <span
              className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-muted border-t-muted-foreground"
              role="status"
              aria-label="Export en cours"
            />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Exporter CSV
        </Button>
      </div>

      {/* Tuiles de résumé */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center justify-between gap-3">
            <span className="text-destructive">{summaryError}</span>
            <Button type="button" variant="outline" size="sm" onClick={loadSummary}>
              Réessayer
            </Button>
          </div>
        ) : summary ? (
          <>
            <StatCard icon={Package} label="Équipements prêtés" value={summary.total} />
            <StatCard
              icon={AlertTriangle}
              label="En retard de restitution"
              value={summary.overdue}
              tone={summary.overdue > 0 ? 'danger' : 'default'}
            />
            <StatCard icon={Layers} label="Catégories" value={summary.byCategory.length} />
            <StatCard icon={Building2} label="Filiales" value={summary.byFiliale.length} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.20)] focus-within:border-[hsl(var(--primary)/0.60)] transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
            placeholder="Série, inventaire, libellé, collaborateur…"
            aria-label="Rechercher un équipement"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={filialeFilter}
          onChange={(e) => { setFilialeFilter(e.target.value); setPage(1); }}
          aria-label="Filtrer par filiale"
        >
          <option value="">Toutes les filiales</option>
          {filiales.map((f) => (
            <option key={f.id} value={f.id}>{f.displayName}</option>
          ))}
        </select>

        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes catégories</option>
          {(summary?.byCategory ?? []).map((c) => (
            <option key={c.category} value={c.category}>{c.label}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-sm text-rose-500 hover:text-rose-700 font-medium transition-colors px-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="bg-card rounded-xl border border-border card-elevated overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center" role="alert">
            <div className="rounded-full bg-red-50 dark:bg-red-900/20 p-4 mb-4">
              <X className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm font-medium text-foreground/80 mb-1">Erreur de chargement</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">{loadError}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
              Réessayer
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Boxes className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground/80 mb-1">
              Aucun équipement prêté ne correspond aux filtres
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="mt-3 text-sm text-[hsl(var(--primary))] hover:opacity-80 font-medium transition-colors"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Inventaire du parc prêté">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Équipement</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">N° série</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">N° inventaire</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collaborateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Filiale</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bon</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Mise à dispo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Restitution prévue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it) => {
                  const overdue = isOverdue(it.dateRestitution);
                  return (
                    <tr key={it.equipmentId} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground leading-tight">{it.label}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {it.categoryLabel ?? it.category}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                        {it.serialNumber || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden lg:table-cell">
                        {it.inventoryNumber || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground leading-tight">{it.collaborateur.displayName}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {it.collaborateur.department || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                        {it.filiale.displayName}
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/bons/${it.bonId}`}
                          className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded hover:underline"
                        >
                          {it.bonReference}
                        </Link>
                        <div className="mt-1">
                          <StatusBadge status={it.bonStatus} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {formatDate(it.dateMiseDisposition)}
                      </td>
                      <td className={`px-4 py-3.5 hidden xl:table-cell whitespace-nowrap ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {it.dateRestitution ? formatDate(it.dateRestitution) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {`Affichage ${rangeStart}–${rangeEnd} sur ${total}`}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Précédent
              </Button>

              <span className="text-sm text-muted-foreground px-1">
                Page <span className="font-medium text-foreground/80">{page}</span> sur{' '}
                <span className="font-medium text-foreground/80">{totalPages}</span>
              </span>

              <Button
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Page suivante"
              >
                Suivant
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
