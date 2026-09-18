import { Button } from '@/components/ui/button';
import { useCatalogue } from './catalogue/useCatalogue';
import { useCatalogueFilters, CATALOGUE_PAGE_SIZE } from './catalogue/useCatalogueFilters';
import { useCatalogueImport } from './catalogue/useCatalogueImport';
import { CatalogueTable } from './catalogue/CatalogueTable';
import { CatalogueFilters } from './catalogue/CatalogueFilters';
import { CataloguePagination } from './catalogue/CataloguePagination';
import { CatalogueToolbar } from './catalogue/CatalogueToolbar';
import { CatalogueImportDialog } from './catalogue/CatalogueImportDialog';
import { PackList } from './catalogue/PackList';
import { CatalogueDialogs } from './catalogue/CatalogueDialogs';
import { buildCatalogCsv, downloadCsv } from './catalogue/lib/csv';

export function CataloguePage() {
  const {
    items, packs, loading, loadError,
    tab, setTab,
    creating, setCreating,
    editingId, setEditingId,
    expandedPack, setExpandedPack,
    newPackName, setNewPackName,
    deactivateTarget, setDeactivateTarget, deactivating,
    removePackItemTarget, setRemovePackItemTarget, removingPackItem,
    duplicateTarget, setDuplicateTarget, duplicateName, setDuplicateName, duplicating,
    pendingPackId, pendingItemId,
    fetchData, reloadCatalog, createItem, updateItem, reactivateItem, reactivatePack,
    confirmDeactivate, createPack, addItemToPack,
    confirmRemovePackItem, updateItemQty, confirmDuplicate,
  } = useCatalogue();

  const {
    searchInput, setSearchInput, categoryFilter, setCategoryFilter,
    sortKey, sortDirection, toggleSort,
    page, setPage, totalPages, total, pageItems, filteredItems, hasActiveFilters, resetFilters,
  } = useCatalogueFilters(items);

  const importState = useCatalogueImport(reloadCatalog);

  const handleExport = (): void => {
    const csv = buildCatalogCsv(filteredItems);
    downloadCsv(`catalogue-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Catalogue & Packs</h1>
        <div className="flex gap-2">
          <Button
            variant={tab === 'catalogue' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('catalogue')}
          >Catalogue</Button>
          <Button
            variant={tab === 'packs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('packs')}
          >Packs</Button>
        </div>
      </div>

      {loadError && !loading && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4 text-center" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Réessayer
          </Button>
        </div>
      )}

      {tab === 'catalogue' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CatalogueFilters
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              hasActiveFilters={hasActiveFilters}
              onReset={resetFilters}
            />
            <CatalogueToolbar
              onImport={importState.openDialog}
              onExport={handleExport}
              exportDisabled={filteredItems.length === 0}
            />
          </div>

          <CatalogueTable
            items={pageItems}
            loading={loading}
            creating={creating}
            editingId={editingId}
            pendingItemId={pendingItemId}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={toggleSort}
            onStartCreating={() => setCreating(true)}
            onCreate={createItem}
            onCancelCreating={() => setCreating(false)}
            onStartEditing={setEditingId}
            onUpdate={updateItem}
            onCancelEditing={() => setEditingId(null)}
            onDeactivateRequest={setDeactivateTarget}
            onReactivate={reactivateItem}
          />

          {!loading && (
            <CataloguePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={CATALOGUE_PAGE_SIZE}
              onPrevPage={() => setPage(page - 1)}
              onNextPage={() => setPage(page + 1)}
            />
          )}
        </div>
      )}

      {tab === 'packs' && (
        <PackList
          packs={packs}
          allItems={items}
          loading={loading}
          newPackName={newPackName}
          onNewPackNameChange={setNewPackName}
          onCreatePack={createPack}
          expandedPack={expandedPack}
          onToggleExpand={setExpandedPack}
          pendingPackId={pendingPackId}
          onDeactivateRequest={setDeactivateTarget}
          onReactivatePack={reactivatePack}
          onDuplicateRequest={setDuplicateTarget}
          onAddItemToPack={addItemToPack}
          onUpdateItemQty={updateItemQty}
          onRemoveItemRequest={setRemovePackItemTarget}
        />
      )}

      <CatalogueDialogs
        deactivateTarget={deactivateTarget}
        onCancelDeactivate={() => setDeactivateTarget(null)}
        onConfirmDeactivate={confirmDeactivate}
        deactivating={deactivating}
        removePackItemTarget={removePackItemTarget}
        onCancelRemovePackItem={() => setRemovePackItemTarget(null)}
        onConfirmRemovePackItem={confirmRemovePackItem}
        removingPackItem={removingPackItem}
        duplicateTarget={duplicateTarget}
        duplicateName={duplicateName}
        onDuplicateNameChange={setDuplicateName}
        onCancelDuplicate={() => setDuplicateTarget(null)}
        onConfirmDuplicate={confirmDuplicate}
        duplicating={duplicating}
      />

      <CatalogueImportDialog state={importState} />
    </div>
  );
}
