import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { useFiliales } from './filiales/useFiliales';
import { FilialeForm } from './filiales/FilialeForm';
import { FilialeListItem } from './filiales/FilialeListItem';
import { DeleteFilialeDialog } from './filiales/DeleteFilialeDialog';

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Filiales</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
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

      <div className="space-y-3">
        {loading ? (
          <FilialesSkeleton />
        ) : filiales.map((f) => (
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
      </div>

      <DeleteFilialeDialog
        deleteTarget={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={remove}
      />
    </div>
  );
}
