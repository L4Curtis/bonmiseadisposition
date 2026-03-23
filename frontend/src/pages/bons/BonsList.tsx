import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { Filiale } from '@/types';

interface Bon {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  collaborateur: { id: string; displayName: string; email: string; department?: string };
  filiale: Filiale;
  createdBy: { id: string; displayName: string };
  equipments: { id: string }[];
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent_mise_dispo', label: 'En attente signature' },
  { value: 'active', label: 'Actif' },
  { value: 'sent_restitution', label: 'Restitution en attente' },
  { value: 'partially_returned', label: 'Restitution partielle' },
  { value: 'archived', label: 'Archivé' },
  { value: 'cancelled', label: 'Annulé' },
];

function TableSkeleton() {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-20 hidden lg:block" />
          <Skeleton className="h-5 w-6 rounded-full hidden sm:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function BonsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bons, setBons] = useState<Bon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filiales, setFiliales] = useState<Filiale[]>([]);

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [filialeFilter, setFilialeFilter] = useState(searchParams.get('filialeId') ?? '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [exportLoading, setExportLoading] = useState(false);

  const limit = 20;

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (filialeFilter) params.set('filialeId', filialeFilter);
      const response = await fetch(`/api/bons/export?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Export échoué');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bons-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.', variant: 'success' });
    } catch {
      toast({ title: 'Erreur', description: "Erreur lors de l'export CSV.", variant: 'destructive' });
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales);
  }, []);

  useEffect(() => {
    const urlParams: Record<string, string> = {};
    if (search) urlParams['search'] = search;
    if (statusFilter) urlParams['status'] = statusFilter;
    if (filialeFilter) urlParams['filialeId'] = filialeFilter;
    setSearchParams(urlParams, { replace: true });

    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (filialeFilter) params.set('filialeId', filialeFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));

    api
      .get<{ bons: Bon[]; total: number }>(`/bons?${params}`)
      .then((data) => {
        setBons(data.bons);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter, filialeFilter, page]);

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters = search || statusFilter || filialeFilter;

  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-lg text-foreground leading-tight">
            Bons de mise à disposition
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? (
              <Skeleton className="h-4 w-16 inline-block" />
            ) : (
              <>{total} bon{total !== 1 ? 's' : ''}</>
            )}
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => navigate('/bons/new')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nouveau bon
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
            placeholder="Rechercher (réf, collaborateur...)"
            aria-label="Rechercher un bon"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
            }}
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
              className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status dropdown */}
        <select
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filtrer par statut"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filiale dropdown */}
        <select
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer"
          value={filialeFilter}
          onChange={(e) => { setFilialeFilter(e.target.value); setPage(1); }}
          aria-label="Filtrer par filiale"
        >
          <option value="">Toutes les filiales</option>
          {filiales.map((f) => (
            <option key={f.id} value={f.id}>{f.displayName}</option>
          ))}
        </select>

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exportLoading}
          className="border-border text-muted-foreground hover:text-foreground"
        >
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

        {/* Reset filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setStatusFilter('');
              setFilialeFilter('');
              setPage(1);
            }}
            className="text-sm text-rose-500 hover:text-rose-700 font-medium transition-colors px-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table container */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : bons.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground/80 mb-1">Aucun bon trouvé</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              {hasActiveFilters
                ? 'Essayez de modifier vos filtres pour afficher plus de résultats.'
                : 'Il n\'y a pas encore de bons de mise à disposition. Créez le premier.'}
            </p>
            {!hasActiveFilters && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => navigate('/bons/new')}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Créer le premier bon
              </Button>
            )}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch('');
                  setSearchInput('');
                  setStatusFilter('');
                  setFilialeFilter('');
                  setPage(1);
                }}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Liste des bons de mise à disposition">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Référence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Collaborateur
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Filiale
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                    Équip.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {bons.map((bon) => (
                  <tr
                    key={bon.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/bons/${bon.id}`)}
                  >
                    {/* Reference */}
                    <td className="px-4 py-3.5">
                      <span className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded">
                        {bon.reference}
                      </span>
                    </td>

                    {/* Collaborateur */}
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground leading-tight">
                        {bon.collaborateur.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {bon.collaborateur.email}
                      </div>
                    </td>

                    {/* Filiale */}
                    <td className="px-4 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                      {bon.filiale.displayName}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                      {formatDate(bon.dateMiseDisposition)}
                    </td>

                    {/* Equipment count */}
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <span className="inline-block text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium px-2 py-0.5 rounded-full">
                        {bon.equipments.length}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}
                      >
                        {BON_STATUS_LABELS[bon.status]}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs text-muted-foreground/70 group-hover:text-blue-600 font-medium transition-colors">
                        Voir
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'Aucun résultat'
              : `Affichage ${rangeStart}–${rangeEnd} sur ${total}`}
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
