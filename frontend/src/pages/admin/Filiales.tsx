import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useFiliales } from './filiales/useFiliales';
import { useFilialesImport } from './filiales/useFilialesImport';
import { useFilialesExport } from './filiales/useFilialesExport';
import { useFilialesStatusFilter } from './filiales/useFilialesStatusFilter';
import { FilialeForm } from './filiales/FilialeForm';
import { FilialeListItem } from './filiales/FilialeListItem';
import { DeleteFilialeDialog } from './filiales/DeleteFilialeDialog';
import { FilialesActionsBar } from './filiales/FilialesActionsBar';
import { FilialesImportDialog } from './filiales/FilialesImportDialog';
import { FilialesStatusFilter } from './filiales/FilialesStatusFilter';

function FilialesSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-20 rounded border" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export function FilialesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    filiales,
    loading,
    loadError,
    fetchFiliales,
    creating,
    setCreating,
    editingId,
    setEditingId,
    deleteTarget,
    setDeleteTarget,
    create,
    update,
    remove,
    uploadFile,
  } = useFiliales();

  const importState = useFilialesImport(fetchFiliales);
  const {
    exporting, exportCsv, downloadingTemplate, downloadTemplate,
  } = useFilialesExport();
  const {
    showInactive, setShowInactive, visibleFiliales, inactiveCount,
  } = useFilialesStatusFilter(filiales);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Filiales</h1>
        <FilialesActionsBar
          onAdd={() => setCreating(true)}
          onImport={importState.openDialog}
          onExportCsv={() => void exportCsv(false)}
          onExportCsvWithImages={() => void exportCsv(true)}
          onDownloadTemplate={() => void downloadTemplate()}
          busy={exporting || downloadingTemplate}
        />
      </div>

      {creating && (
        <FilialeForm onSave={create} onCancel={() => setCreating(false)} />
      )}

      {loadError && !loading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchFiliales}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && !loadError && filiales.length > 0 && (
        <div className="flex justify-end">
          <FilialesStatusFilter
            showInactive={showInactive}
            onChange={setShowInactive}
            inactiveCount={inactiveCount}
          />
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <FilialesSkeleton />
        ) : visibleFiliales.map((f) => (
          <FilialeListItem
            key={f.id}
            filiale={f}
            isEditing={editingId === f.id}
            isAdmin={isAdmin}
            onSave={(data) => update(f.id, data)}
            onCancelEdit={() => setEditingId(null)}
            onStartEdit={() => setEditingId(f.id)}
            onDelete={() => setDeleteTarget(f)}
            onUpload={(type, file) => uploadFile(f.id, type, file)}
          />
        ))}
        {!loading && !loadError && filiales.length === 0 && !creating && (
          <div className="text-center py-10 text-sm text-muted-foreground/70">
            Aucune filiale configurée
          </div>
        )}
        {!loading && !loadError && filiales.length > 0 && visibleFiliales.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground/70">
            Toutes les filiales sont désactivées
          </div>
        )}
      </div>

      <DeleteFilialeDialog
        deleteTarget={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={remove}
      />

      <FilialesImportDialog state={importState} />
    </div>
  );
}
