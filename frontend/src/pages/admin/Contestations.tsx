import { AlertOctagon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContestations } from './contestations/useContestations';
import { ContestationsTable } from './contestations/ContestationsTable';
import { ResolveDialog } from './contestations/ResolveDialog';
import { STATUS_OPTIONS } from './contestations/statusMeta';

export function ContestationsPage() {
  const {
    data,
    loading,
    loadError,
    load,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    resolving,
    setResolving,
    handleReview,
    totalPages,
    openCount,
  } = useContestations();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-5 w-5 text-destructive" />
        <h1 className="text-xl font-bold text-foreground">Contestations</h1>
        {data && data.total > 0 && (
          <span className="text-sm text-muted-foreground/70">({data.total} au total)</span>
        )}
        {openCount > 0 && (
          <span className="inline-flex rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold">
            {openCount} ouvertes
          </span>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 items-center">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              statusFilter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ContestationsTable
        contestations={data?.contestations}
        loading={loading}
        loadError={loadError}
        onRetry={load}
        onReview={handleReview}
        onResolve={setResolving}
      />

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
