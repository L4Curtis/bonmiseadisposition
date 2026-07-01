import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { AlertOctagon, ChevronLeft, ChevronRight, CheckCircle, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

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
  open: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  in_review: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  resolved: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  rejected: 'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverte' },
  { value: 'in_review', label: 'En cours d\'examen' },
  { value: 'resolved', label: 'Résolue' },
  { value: 'rejected', label: 'Rejetée' },
];

// ─── Dialog de résolution ──────────────────────────────────────────────────

function ResolveDialog({
  contestation,
  open,
  onOpenChange,
  onSuccess,
}: {
  contestation: Contestation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<'resolved' | 'rejected'>('resolved');
  const [resolutionMessage, setResolutionMessage] = useState('');
  const [correct, setCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleClose = (v: boolean) => {
    if (!v) { setResolutionMessage(''); setError(''); setAction('resolved'); setCorrect(false); }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!contestation) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.patch<{ correctedBon?: { id: string; reference: string } | null }>(
        `/contestations/${contestation.id}/resolve`,
        {
          action,
          resolutionMessage: resolutionMessage.trim() || undefined,
          correct: action === 'resolved' ? correct : undefined,
        },
      );
      handleClose(false);
      toast({
        title: action === 'resolved' ? 'Contestation acceptée' : 'Contestation rejetée',
        description: result.correctedBon
          ? `Bon annulé — brouillon corrigé ${result.correctedBon.reference} créé.`
          : `La contestation de ${contestation.user.displayName} a été traitée.`,
        variant: action === 'resolved' ? 'success' : 'default',
      });
      onSuccess();
      // Ouvrir directement le brouillon corrigé pour édition puis re-signature
      if (result.correctedBon) {
        navigate(`/bons/${result.correctedBon.id}/edit`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors du traitement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Traiter la contestation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 border p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Motif du collaborateur ({contestation?.user.displayName})</p>
            <p className="text-foreground/80">{contestation?.message}</p>
          </div>

          <div className="space-y-2">
            <Label>Décision</Label>
            <div className="flex gap-3">
              <button
                onClick={() => setAction('resolved')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'resolved' ? 'border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
              >
                <CheckCircle className="h-4 w-4" /> Accepter
              </button>
              <button
                onClick={() => setAction('rejected')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${action === 'rejected' ? 'border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
              >
                <XCircle className="h-4 w-4" /> Rejeter
              </button>
            </div>
          </div>

          {action === 'resolved' && (
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
              <input
                type="checkbox"
                checked={correct}
                onChange={(e) => setCorrect(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-foreground/80">
                <strong>Corriger et re-signer</strong> — le bon contesté sera annulé et un
                brouillon pré-rempli sera créé pour correction puis nouvelle signature.
                Sans cette option, le bon revient simplement à son état antérieur.
              </span>
            </label>
          )}

          <div className="space-y-2">
            <Label htmlFor="resolution-msg">Réponse au collaborateur (optionnel)</Label>
            <textarea
              id="resolution-msg"
              className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Expliquez votre décision..."
              value={resolutionMessage}
              onChange={(e) => setResolutionMessage(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Annuler</Button>
          <Button
            size="sm"
            className={action === 'resolved' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Envoi...' : action === 'resolved' ? 'Accepter la contestation' : 'Rejeter la contestation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));
    api.get<ContestationResponse>(`/contestations?${params}`)
      .then(setData)
      .catch((e: unknown) => {
        // Une panne ne doit pas s'afficher comme « aucune contestation »
        setData(null);
        setLoadError(e instanceof Error && e.message ? e.message : 'Erreur lors du chargement des contestations');
      })
      .finally(() => setLoading(false));
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id: string) => {
    try {
      await api.patch(`/contestations/${id}/review`);
    } catch (e: unknown) {
      toast({
        title: 'Erreur',
        description: e instanceof Error && e.message ? e.message : 'Erreur lors de la prise en charge',
        variant: 'destructive',
      });
    }
    load();
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const openCount = data?.contestations.filter(c => c.status === 'open').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-5 w-5 text-red-500" />
        <h1 className="text-xl font-bold text-foreground">Contestations</h1>
        {data && data.total > 0 && (
          <span className="text-sm text-muted-foreground/70">({data.total} au total)</span>
        )}
        {openCount > 0 && (
          <span className="inline-flex rounded-full bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs font-semibold">
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
                : 'bg-card text-muted-foreground border-border hover:bg-muted/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <div className="flex-1 space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-40" /></div>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-sm" role="alert">
            <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
            <p className="text-red-600">{loadError}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>
              Réessayer
            </Button>
          </div>
        ) : !data?.contestations.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground/70">
            <AlertOctagon className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aucune contestation trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Liste des contestations">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bon</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Collaborateur</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motif</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.contestations.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(c.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <button
                        className="font-mono font-semibold text-primary hover:underline"
                        onClick={() => navigate(`/bons/${c.bon.id}`)}
                      >
                        {c.bon.reference}
                      </button>
                      <p className="text-muted-foreground/70">{c.bon.filiale.displayName}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-foreground/80">{c.user.displayName}</div>
                      <div className="text-muted-foreground/70">{c.user.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                      <p className="truncate" title={c.message}>{c.message}</p>
                      {c.resolvedBy && (
                        <p className="text-muted-foreground/70 mt-0.5">Traité par {c.resolvedBy.displayName}</p>
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
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 transition-colors"
                            title="Prendre en charge"
                          >
                            <Eye className="h-3 w-3" /> Prendre en charge
                          </button>
                        )}
                        {['open', 'in_review'].includes(c.status) && (
                          <button
                            onClick={() => setResolving(c)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                          >
                            <CheckCircle className="h-3 w-3" /> Traiter
                          </button>
                        )}
                        {c.resolutionMessage && (
                          <span className="text-xs text-muted-foreground/70 italic truncate max-w-[120px]" title={c.resolutionMessage}>
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
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total} contestation(s)</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ResolveDialog
        contestation={resolving}
        open={!!resolving}
        onOpenChange={(open) => { if (!open) setResolving(null); }}
        onSuccess={load}
      />
    </div>
  );
}
