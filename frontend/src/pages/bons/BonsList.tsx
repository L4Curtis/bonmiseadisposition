import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, FileText, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';
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

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

export function BonsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bons, setBons] = useState<Bon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filiales, setFiliales] = useState<Filiale[]>([]);

  // Initialiser les filtres depuis les query params (ex: navigation depuis le dashboard)
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
    } catch {
      alert('Erreur lors de l\'export');
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales);
  }, []);

  useEffect(() => {
    // Synchroniser l'URL avec les filtres actifs
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Bons de mise à disposition</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exportLoading}>
            {exportLoading
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button size="sm" onClick={() => navigate('/bons/new')}>
            <Plus className="h-4 w-4" /> Nouveau bon
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 flex-1 min-w-48">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
            placeholder="Rechercher (réf, collaborateur...)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
            }}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
              className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          )}
        </div>
        <select
          className="rounded-md border bg-white px-3 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="rounded-md border bg-white px-3 py-1.5 text-sm"
          value={filialeFilter}
          onChange={(e) => { setFilialeFilter(e.target.value); setPage(1); }}
        >
          <option value="">Toutes les filiales</option>
          {filiales.map((f) => (
            <option key={f.id} value={f.id}>{f.displayName}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : bons.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-400">
              <FileText className="h-8 w-8 mb-3" />
              <p className="text-sm">Aucun bon trouvé</p>
              <button
                className="mt-3 text-sm text-blue-600 hover:underline"
                onClick={() => navigate('/bons/new')}
              >
                Créer le premier bon
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Référence</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Collaborateur</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Filiale</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date mise à dispo</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Équipements</th>
                </tr>
              </thead>
              <tbody>
                {bons.map((bon) => (
                  <tr
                    key={bon.id}
                    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/bons/${bon.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                      {bon.reference}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{bon.collaborateur.displayName}</div>
                      <div className="text-xs text-slate-400">{bon.collaborateur.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{bon.filiale.displayName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}>
                        {BON_STATUS_LABELS[bon.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(bon.dateMiseDisposition)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{bon.equipments.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{total} bon(s) au total</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
