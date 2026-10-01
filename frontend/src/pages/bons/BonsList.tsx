import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmModal } from './detail/ConfirmModal';
import { useBonsListParams } from './list/useBonsListParams';
import { BonsFilters } from './list/BonsFilters';
import { BonsTable } from './list/BonsTable';
import { Pagination } from '@/components/list';
import { ExportButton } from '@/components/export';
import { todayInParis } from '@/lib/dates';
import { QuickViewsBar } from './list/QuickViewsBar';
import { BulkActionsBar } from './list/BulkActionsBar';
import { BulkResendDialog } from './list/BulkResendDialog';
import { buildQuickViews, findActiveView } from './list/quickViews';
import { useBonCreators } from './list/useBonCreators';
import { useBonsExport } from './list/useBonsExport';
import { useBonsSelection } from './list/useBonsSelection';
import { useResendLinks } from './list/useResendLinks';
import { canResendLink } from './list/resendEligibility';
import { formatTimeAgo } from './list/relativeTime';
import { bonsExportFilters } from './list/exportFilters';
import { toExportParams } from './list/bonsListQuery';
import type { Bon } from './list/types';

const NOT_RESENDABLE_REASON = 'Pas en attente de signature par email';

export function BonsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const list = useBonsListParams();
  const { query } = list;
  const creators = useBonCreators();
  const { exportLoading, exportCsv } = useBonsExport(query);
  const selection = useBonsSelection(list.bons);
  const resend = useResendLinks(list.reload);
  // Sélection figée à l'ouverture de la relance groupée : la liste est
  // rechargée à la fin (statuts à jour), ce qui vide la sélection courante,
  // alors que le compte rendu doit encore nommer chaque bon.
  const [bulkTargets, setBulkTargets] = useState<Bon[] | null>(null);

  const quickViews = useMemo(() => buildQuickViews(user?.id), [user?.id]);
  const activeView = findActiveView(quickViews, query);
  const resendableCount = selection.selectedBons.filter(canResendLink).length;
  const bulkBusy = resend.progress !== null;
  const bulkEligible = bulkTargets?.filter(canResendLink) ?? [];

  const startBulkResend = (force: boolean) => {
    if (!bulkTargets) return;
    const preSkipped = bulkTargets
      .filter((b) => !canResendLink(b))
      .map((b) => ({ id: b.id, outcome: 'skipped' as const, reason: NOT_RESENDABLE_REASON }));
    void resend.resendMany(bulkEligible.map((b) => b.id), force, preSkipped);
  };

  const closeBulk = () => {
    setBulkTargets(null);
    resend.clearReport();
  };

  const confirmRecentResend = () => {
    const pending = resend.confirmation;
    if (pending) void resend.resendOne(pending.bonId, pending.reference, true);
  };

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-lg text-foreground leading-tight">
            Bons de mise à disposition
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {list.loading ? (
              <Skeleton as="span" className="h-4 w-16 inline-block" />
            ) : (
              <>{list.total} bon{list.total !== 1 ? 's' : ''}</>
            )}
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate('/bons/new')}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nouveau bon
        </Button>
      </div>

      <QuickViewsBar views={quickViews} activeViewId={activeView?.id} onSelect={(v) => list.applyQuery(v.query)} />

      <BonsFilters
        query={query}
        searchInput={list.searchInput}
        onSearchInputChange={list.setSearchInput}
        onSearchSubmit={() => list.setSearch(list.searchInput)}
        onClearSearch={() => { list.setSearchInput(''); list.setSearch(''); }}
        statusSelectValue={list.statusSelectValue}
        onStatusSelect={list.handleStatusSelect}
        onFilialeChange={list.setFilialeFilter}
        filiales={list.filiales}
        onSortChange={(sort, order) => list.updateFilters({ sort, order })}
        onAdvancedChange={list.updateFilters}
        currentUserId={user?.id}
        creators={creators}
        exportControl={
          <ExportButton
            path={`/bons/export?${toExportParams(query)}`}
            fallbackFilename={`bons-export-${todayInParis()}.csv`}
            filters={bonsExportFilters(query, { filiales: list.filiales, creators, currentUserId: user?.id })}
            count={list.loading ? null : list.total}
            limit={list.exportLimit}
            itemLabel={{ singular: 'bon', plural: 'bons' }}
          />
        }
        hasActiveFilters={list.hasActiveFilters}
        onResetFilters={list.resetFilters}
        onClearFilter={list.updateFilters}
      />

      {selection.selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selection.selectedIds.size}
          resendableCount={resendableCount}
          onResend={() => setBulkTargets(selection.selectedBons)}
          onExport={() => { void exportCsv(selection.selectedBons.map((b) => b.id)); }}
          onClear={selection.clear}
          busy={bulkBusy || exportLoading}
        />
      )}

      <BonsTable
        loading={list.loading}
        loadError={list.loadError}
        bons={list.bons}
        hasActiveFilters={list.hasActiveFilters}
        onRetry={list.reload}
        onCreateNew={() => navigate('/bons/new')}
        onResetFilters={list.resetFilters}
        sort={query.sort}
        order={query.order}
        onSort={list.toggleSort}
        selection={selection}
        onResend={(bon) => { void resend.resendOne(bon.id, bon.reference); }}
        resendLoadingId={resend.rowLoadingId}
        resendBusy={resend.rowLoadingId !== null || bulkBusy}
      />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        itemLabel={{ singular: 'bon', plural: 'bons' }}
      />

      {/* Même confirmation que la fiche : lien envoyé il y a moins d'une heure */}
      {resend.confirmation && (
        <ConfirmModal
          title="Lien récemment envoyé"
          message={`Un lien de signature a déjà été envoyé ${formatTimeAgo(resend.confirmation.sentAt)} pour le bon ${resend.confirmation.reference}. Le collaborateur l'a peut-être reçu. Renvoyer quand même ?`}
          confirmLabel="Renvoyer"
          onConfirm={confirmRecentResend}
          onCancel={resend.dismissConfirmation}
          loading={resend.rowLoadingId !== null}
        />
      )}

      {bulkTargets && (
        <BulkResendDialog
          selected={bulkTargets}
          eligibleCount={bulkEligible.length}
          progress={resend.progress}
          report={resend.report}
          onConfirm={startBulkResend}
          onClose={closeBulk}
        />
      )}
    </div>
  );
}
