import { Button } from '@/components/ui/button';
import { useCatalogue } from './catalogue/useCatalogue';
import { CatalogueTable } from './catalogue/CatalogueTable';
import { PackList } from './catalogue/PackList';
import { CatalogueDialogs } from './catalogue/CatalogueDialogs';

export function CataloguePage() {
  const {
    items, packs, loading, loadError,
    tab, setTab,
    creating, setCreating,
    editingId, setEditingId,
    expandedPack, setExpandedPack,
    newPackName, setNewPackName,
    deleteTarget, setDeleteTarget,
    removePackItemTarget, setRemovePackItemTarget,
    pendingPackId,
    fetchData, createItem, updateItem, reactivateItem, reactivatePack,
    confirmDelete, createPack, addItemToPack,
    confirmRemovePackItem, updateItemQty,
  } = useCatalogue();

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
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-center" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Réessayer
          </Button>
        </div>
      )}

      {tab === 'catalogue' && (
        <CatalogueTable
          items={items}
          loading={loading}
          creating={creating}
          editingId={editingId}
          onStartCreating={() => setCreating(true)}
          onCreate={createItem}
          onCancelCreating={() => setCreating(false)}
          onStartEditing={setEditingId}
          onUpdate={updateItem}
          onCancelEditing={() => setEditingId(null)}
          onDeleteRequest={setDeleteTarget}
          onReactivate={reactivateItem}
        />
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
          onDeleteRequest={setDeleteTarget}
          onReactivatePack={reactivatePack}
          onAddItemToPack={addItemToPack}
          onUpdateItemQty={updateItemQty}
          onRemoveItemRequest={setRemovePackItemTarget}
        />
      )}

      <CatalogueDialogs
        deleteTarget={deleteTarget}
        onCancelDelete={() => setDeleteTarget(null)}
        onConfirmDelete={confirmDelete}
        removePackItemTarget={removePackItemTarget}
        onCancelRemovePackItem={() => setRemovePackItemTarget(null)}
        onConfirmRemovePackItem={confirmRemovePackItem}
      />
    </div>
  );
}
