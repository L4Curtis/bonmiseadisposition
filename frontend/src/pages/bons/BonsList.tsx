import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { useBonsListParams } from './list/useBonsListParams';
import { BonsFilters } from './list/BonsFilters';
import { BonsTable } from './list/BonsTable';
import { BonsPagination } from './list/BonsPagination';

export function BonsListPage() {
  const navigate = useNavigate();
  const {
    bons,
    total,
    page,
    setPage,
    loading,
    loadError,
    filiales,
    searchInput,
    setSearchInput,
    setSearch,
    statusSelectValue,
    handleStatusSelect,
    filialeFilter,
    setFilialeFilter,
    exportLoading,
    handleExport,
    resetFilters,
    excludeStatus,
    setExcludeStatus,
    overdue,
    setOverdue,
    setReloadKey,
    totalPages,
    hasActiveFilters,
    rangeStart,
    rangeEnd,
  } = useBonsListParams();

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
              <Skeleton as="span" className="h-4 w-16 inline-block" />
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

      <BonsFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={() => { setSearch(searchInput); setPage(1); }}
        onClearSearch={() => { setSearchInput(''); setSearch(''); setPage(1); }}
        statusSelectValue={statusSelectValue}
        onStatusSelect={handleStatusSelect}
        filialeFilter={filialeFilter}
        onFilialeChange={(value) => { setFilialeFilter(value); setPage(1); }}
        filiales={filiales}
        exportLoading={exportLoading}
        onExport={handleExport}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        excludeStatus={excludeStatus}
        onClearExcludeStatus={() => { setExcludeStatus(''); setPage(1); }}
        overdue={overdue}
        onClearOverdue={() => { setOverdue(false); setPage(1); }}
      />

      <BonsTable
        loading={loading}
        loadError={loadError}
        bons={bons}
        hasActiveFilters={hasActiveFilters}
        onRetry={() => setReloadKey((k) => k + 1)}
        onCreateNew={() => navigate('/bons/new')}
        onResetFilters={resetFilters}
        onRowClick={(bonId) => navigate(`/bons/${bonId}`)}
      />

      {total > 0 && (
        <BonsPagination
          total={total}
          page={page}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPrevPage={() => setPage((p) => p - 1)}
          onNextPage={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  );
}
