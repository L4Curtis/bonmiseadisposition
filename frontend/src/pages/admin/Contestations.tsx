import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { AlertOctagon, ChevronLeft, ChevronRight, CheckCircle, XCircle, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Contestation {
  id: string;
  message: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolutionMessage?: string;
  createdAt: string;
  updatedAt: string;
  bon: { id: string; reference: string; status: string; filiale: { displayName: string } };
  user: { id: string; displayName: string; email: string };
  resolvedBy?: { id: string; displayName: string } | null;
}

interface ContestationResponse {
  contestations: Contestation[];
  total: number;
  page: number;
  limit: number;
}

// ─── Statuts et couleurs ───────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: 'Ouverte',
  in_review: 'En cours d\'examen',
  resolved: 'Résolue',
  rejected: 'Rejetée',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_review: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-slate-100 text-slate-600',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverte' },
  { value: 'in_review', label: 'En cours d\'examen' },
  { value: 'resolved', label: 'Résolue' },
  { value: 'rejected', label: 'Rejetée' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Modal de résolution ───────────────────────────────────────────────────

function ResolveModal({
  contestation,
  onClose,
  onSuccess,
}: {
  contestation: Contestation;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<'resolved' | 'rejected'>('resolved');
  const [resolutionMessage, setResolutionMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await api.patch(`/contestations/${contestation.id}/resolve`, { action, resolutionMessage: resolutionMessage.trim() || undefined });
      onSuccess();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors du traitement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-slate-900">Traiter la contestation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-slate-50 border p-3 text-sm">
            <p className="text-slate-500 text-xs mb-1">Motif du collaborateur ({contestation.user.displayName})</p>
            <p className="text-slate-700">{contestation.message}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Décision</label>
            <div className="flex gap-3">
              <button
                onClick={() => setAction('resolved')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'resolved' ? 'border-green-400 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <CheckCircle className="h-4 w-4" /> Accepter
              </button>
              <button
                onClick={() => setAction('rejected')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'rejected' ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <XCircle className="h-4 w-4" /> Rejeter
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Réponse au collaborateur (optionnel)</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              rows={3}
              placeholder="Expliquez votre décision..."
              value={resolutionMessage}
              onChange={(e) => setResolutionMessage(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end border-t px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            size="sm"
            className={action === 'resolved' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Envoi...' : action === 'resolved' ? 'Accepter la contestation' : 'Rejeter la contestation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ContestationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ContestationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('open');
  const [resolving, setResolving] = useState<Contestation | null>(null);
  const limit = 20;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));
    api.get<ContestationResponse>(`/contestations?${params}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id: string) => {
    await api.patch(`/contestations/${id}/review`);
    load();
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const openCount = data?.contestations.filter(c => c.status === 'open').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-5 w-5 text-red-500" />
        <h1 className="text-xl font-bold text-slate-900">Contestations</h1>
        {data && data.total > 0 && (
          <span className="text-sm text-slate-400">({data.total} au total)</span>
        )}
        {openCount > 0 && (
          <span className="inline-flex rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
            {openCount} ouvertes
          </span>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 items-center">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              statusFilter === opt.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : !data?.contestations.length ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <AlertOctagon className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aucune contestation trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Bon</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Collaborateur</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Motif</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.contestations.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <button
                        className="font-mono font-semibold text-blue-600 hover:underline"
                        onClick={() => navigate(`/bons/${c.bon.id}`)}
                      >
                        {c.bon.reference}
                      </button>
                      <p className="text-slate-400">{c.bon.filiale.displayName}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-slate-700">{c.user.displayName}</div>
                      <div className="text-slate-400">{c.user.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs">
                      <p className="truncate" title={c.message}>{c.message}</p>
                      {c.resolvedBy && (
                        <p className="text-slate-400 mt-0.5">Traité par {c.resolvedBy.displayName}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {c.status === 'open' && (
                          <button
                            onClick={() => handleReview(c.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                            title="Prendre en charge"
                          >
                            <Eye className="h-3 w-3" /> Prendre en charge
                          </button>
                        )}
                        {['open', 'in_review'].includes(c.status) && (
                          <button
                            onClick={() => setResolving(c)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <CheckCircle className="h-3 w-3" /> Traiter
                          </button>
                        )}
                        {c.resolutionMessage && (
                          <span className="text-xs text-slate-400 italic truncate max-w-[120px]" title={c.resolutionMessage}>
                            {c.resolutionMessage}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{data?.total} contestation(s)</span>
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

      {resolving && (
        <ResolveModal
          contestation={resolving}
          onClose={() => setResolving(null)}
          onSuccess={() => { setResolving(null); load(); }}
        />
      )}
    </div>
  );
}
