import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isItRole } from '@/lib/roles';
import { Boxes, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useInventory } from './inventaire/useInventory';
import { InventorySummaryCards } from './inventaire/InventorySummaryCards';
import { InventoryFilters } from './inventaire/InventoryFilters';
import { InventoryTable } from './inventaire/InventoryTable';

export function InventairePage() {
  const { user } = useAuth();
  // Direction : lecture seule, aucun accès aux bons individuels (/bons/:id → 403).
  const canLinkToBon = isItRole(user?.role);

  const {
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
    searchInput,
    setSearchInput,
    resetFilters,
    exportLoading,
    handleExport,
    totalPages,
    hasActiveFilters,
    rangeStart,
    rangeEnd,
  } = useInventory();

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

      <InventorySummaryCards summary={summary} summaryError={summaryError} onRetry={loadSummary} />

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
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      <InventoryTable
        items={items}
        loading={loading}
        loadError={loadError}
        onRetry={retry}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        canLinkToBon={canLinkToBon}
      />

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
