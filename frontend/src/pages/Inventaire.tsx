import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { Boxes, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useInventory } from './inventaire/useInventory';
import { useCollaborateurInventory } from './inventaire/useCollaborateurInventory';
import { computePaginationInfo } from './inventaire/inventoryFilterParams';
import { InventorySummaryCards } from './inventaire/InventorySummaryCards';
import { InventoryFilters } from './inventaire/InventoryFilters';
import { InventoryTable } from './inventaire/InventoryTable';
import { CollaborateurTable } from './inventaire/CollaborateurTable';
import { InventoryViewToggle } from './inventaire/InventoryViewToggle';

export function InventairePage() {
  const { user } = useAuth();
  // Direction : lecture seule, aucun accès aux bons individuels (/bons/:id → 403).
  const canLinkToBon = isItRole(user?.role);

  const {
    view,
    setView,
    items,
    total,
    page,
    setPage,
    loading,
    loadError,
    retry,
    summary,
    summaryError,
    loadSummary,
    filiales,
    filialeFilter,
    setFilialeFilter,
    categoryFilter,
    setCategoryFilter,
    situationFilter,
    setSituationFilter,
    overdueFilter,
    setOverdueFilter,
    missingSerialFilter,
    setMissingSerialFilter,
    compteFilter,
    setCompteFilter,
    sort,
    changeSort,
    searchInput,
    setSearchInput,
    resetFilters,
    exportLoading,
    handleExport,
    hasActiveFilters,
    baseFilters,
  } = useInventory();

  const collaborateurs = useCollaborateurInventory({
    enabled: view === 'collaborateurs',
    filters: baseFilters,
    page,
    setPage,
    compteFilter,
  });

  const activeTotal = view === 'equipements' ? total : collaborateurs.total;
  const { totalPages, rangeStart, rangeEnd } = computePaginationInfo(activeTotal, page);

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
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportLoading}
            title="Exporte le détail par équipement, avec les filtres actuellement actifs."
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
          {view === 'collaborateurs' && (
            <p className="text-[11px] text-muted-foreground/70">Export au détail par équipement, filtres actifs.</p>
          )}
        </div>
      </div>

      <InventorySummaryCards
        summary={summary}
        summaryError={summaryError}
        onRetry={loadSummary}
        onOverdueClick={() => setOverdueFilter(true)}
        overdueActive={overdueFilter}
        onSignatureWaitingClick={() => setSituationFilter('en_attente_signature')}
        signatureWaitingActive={situationFilter === 'en_attente_signature'}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <InventoryViewToggle view={view} onChange={setView} />
      </div>

      <InventoryFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        filialeFilter={filialeFilter}
        onFilialeFilterChange={setFilialeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        situationFilter={situationFilter}
        onSituationFilterChange={setSituationFilter}
        situations={summary?.bySituation ?? []}
        filiales={filiales}
        categories={summary?.byCategory ?? []}
        overdueFilter={overdueFilter}
        onClearOverdue={() => setOverdueFilter(false)}
        missingSerialFilter={missingSerialFilter}
        onMissingSerialFilterChange={setMissingSerialFilter}
        compteFilter={compteFilter}
        onCompteFilterChange={setCompteFilter}
        showCompteFilter={view === 'collaborateurs'}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      {view === 'equipements' ? (
        <InventoryTable
          items={items}
          loading={loading}
          loadError={loadError}
          onRetry={retry}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          canLinkToBon={canLinkToBon}
          sort={sort}
          onSortChange={changeSort}
        />
      ) : (
        <CollaborateurTable
          items={collaborateurs.items}
          loading={collaborateurs.loading}
          loadError={collaborateurs.error}
          onRetry={collaborateurs.retry}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          canLinkToBon={canLinkToBon}
          sort={collaborateurs.sort}
          onSortChange={collaborateurs.setSort}
          filters={baseFilters}
          truncated={collaborateurs.truncated}
        />
      )}

      {/* Pagination */}
      {activeTotal > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {`Affichage ${rangeStart}–${rangeEnd} sur ${activeTotal}`}
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
