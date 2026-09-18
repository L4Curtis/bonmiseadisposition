import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { buildCatalogCsv, buildCatalogTemplateCsv, downloadCsv } from './catalogue/lib/csv';
import { filterPacksByStatus } from './catalogue/lib/statusFilter';
import type { ItemStatusFilter } from './catalogue/lib/statusFilter';

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

  // Filtre d'état partagé par le catalogue et les packs (Actifs par défaut) —
  // voir catalogue/lib/statusFilter.
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>('active');

  const {
    searchInput, setSearchInput, categoryFilter, setCategoryFilter,
    sortKey, sortDirection, toggleSort,
    page, setPage, totalPages, total, pageItems, filteredItems, hasActiveFilters, resetFilters,
  } = useCatalogueFilters(items, statusFilter);

  const importState = useCatalogueImport(reloadCatalog);

  const visiblePacks = useMemo(() => filterPacksByStatus(packs, statusFilter), [packs, statusFilter]);

  const handleExport = (): void => {
    const csv = buildCatalogCsv(filteredItems);
    downloadCsv(`catalogue-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleDownloadTemplate = (): void => {
    downloadCsv('modele-catalogue.csv', buildCatalogTemplateCsv());
  };

  const handleAddEquipment = (): void => setCreating(true);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Catalogue & Packs</h1>

      {loadError && !loading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Réessayer
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v === 'packs' ? 'packs' : 'catalogue')}>
        <TabsList>
          <TabsTrigger value="catalogue">Catalogue ({items.length})</TabsTrigger>
          <TabsTrigger value="packs">Packs ({packs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {tab === 'catalogue' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CatalogueFilters
                  searchInput={searchInput}
                  onSearchInputChange={setSearchInput}
                  categoryFilter={categoryFilter}
                  onCategoryFilterChange={setCategoryFilter}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  hasActiveFilters={hasActiveFilters}
                  onReset={resetFilters}
                />
                <CatalogueToolbar
                  onAddEquipment={handleAddEquipment}
                  onImport={importState.openDialog}
                  onExport={handleExport}
                  exportDisabled={filteredItems.length === 0}
                  onDownloadTemplate={handleDownloadTemplate}
                />
              </div>

              <CatalogueTable
                items={pageItems}
                totalCount={items.length}
                hasInactiveItems={filteredItems.some((item) => !item.active)}
                loading={loading}
                creating={creating}
                editingId={editingId}
                pendingItemId={pendingItemId}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort}
                onCreate={createItem}
                onCancelCreating={() => setCreating(false)}
                onStartEditing={setEditingId}
                onUpdate={updateItem}
                onCancelEditing={() => setEditingId(null)}
                onDeactivateRequest={setDeactivateTarget}
                onReactivate={reactivateItem}
                onAddEquipment={handleAddEquipment}
                onImport={importState.openDialog}
                onDownloadTemplate={handleDownloadTemplate}
                onResetFilters={resetFilters}
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
          ) : (
            <PackList
              packs={visiblePacks}
              totalPacksCount={packs.length}
              allItems={items}
              loading={loading}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
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
        </TabsContent>
      </Tabs>

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
