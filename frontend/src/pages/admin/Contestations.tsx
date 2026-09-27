import { AlertOctagon } from 'lucide-react';
import { Pagination } from '@/components/list';
import { cn } from '@/lib/utils';
import { CONTESTATIONS_PAGE_SIZE, useContestations } from './contestations/useContestations';
import { ContestationsTable } from './contestations/ContestationsTable';
import { ResolveDialog } from './contestations/ResolveDialog';
import { CONTESTATION_FILTERS } from './contestations/contestation-meta';

/** Compteurs de l'en-tête : les mêmes pour toutes les listes (ils ignorent le
 *  filtre), « nouvelles » étant le chiffre de la pastille du menu. */
function Counters({ openCount, pendingCount, overdueCount, overdueAfterDays }: {
  openCount: number;
  pendingCount: number;
  overdueCount: number;
  overdueAfterDays: number;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {pendingCount === 0 ? (
        'Aucune contestation à traiter.'
      ) : (
        <>
          <strong className="text-foreground">{pendingCount} à traiter</strong>, dont {openCount} nouvelle{openCount > 1 ? 's' : ''}
          {overdueCount > 0 && (
            <span className="text-destructive font-medium">
              {' '}et {overdueCount} en attente depuis plus de {overdueAfterDays} jours ouvrés
            </span>
          )}
          .
        </>
      )}
    </p>
  );
}

export function ContestationsPage() {
  const list = useContestations();
  const { data } = list;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <AlertOctagon className="h-5 w-5 text-destructive" /> Contestations
        </h1>
        {data && (
          <Counters
            openCount={data.openCount}
            pendingCount={data.pendingCount}
            overdueCount={data.overdueCount}
            overdueAfterDays={data.overdueAfterDays}
          />
        )}
      </div>

      <div role="group" aria-label="Filtrer les contestations" className="flex flex-wrap gap-2">
        {CONTESTATION_FILTERS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={list.filter === opt.value}
            onClick={() => list.setFilter(opt.value)}
            className={cn(
              'min-h-11 sm:min-h-8 rounded-full px-4 text-sm font-medium border transition-colors',
              list.filter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted/40',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ContestationsTable
        contestations={data?.contestations}
        overdueSince={data?.overdueSince ?? null}
        loading={list.loading}
        loadError={list.loadError}
        onRetry={list.load}
        reviewingId={list.reviewingId}
        onReview={list.handleReview}
        onDecide={list.setDeciding}
      />

      {data && (
        <Pagination
          page={list.page}
          pageSize={CONTESTATIONS_PAGE_SIZE}
          total={data.total}
          onPageChange={list.setPage}
          itemLabel={{ singular: 'contestation', plural: 'contestations' }}
        />
      )}

      <ResolveDialog
        contestation={list.deciding}
        open={!!list.deciding}
        onOpenChange={(open) => {
          if (!open) list.setDeciding(null);
        }}
        onSuccess={list.load}
      />
    </div>
  );
}
