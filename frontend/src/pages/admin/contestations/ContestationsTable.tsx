import { useNavigate } from 'react-router';
import { CheckCircle, Eye, XCircle, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';
import { STATUS_COLORS, STATUS_LABELS } from './statusMeta';
import type { Contestation } from './types';

interface ContestationsTableProps {
  contestations: Contestation[] | undefined;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onReview: (id: string) => void;
  onResolve: (contestation: Contestation) => void;
}

function TableSkeleton() {
  return (
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
  );
}

/** Table des contestations : gère elle-même le chargement, l'erreur et l'état vide. */
export function ContestationsTable({
  contestations,
  loading,
  loadError,
  onRetry,
  onReview,
  onResolve,
}: ContestationsTableProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <div className="py-12 text-center text-sm" role="alert">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive/70" />
          <p className="text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : !contestations?.length ? (
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
              {contestations.map((c) => (
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
                          onClick={() => onReview(c.id)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                          title="Prendre en charge"
                        >
                          <Eye className="h-3 w-3" /> Prendre en charge
                        </button>
                      )}
                      {['open', 'in_review'].includes(c.status) && (
                        <button
                          onClick={() => onResolve(c)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
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
  );
}
