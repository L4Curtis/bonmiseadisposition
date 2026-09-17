import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { CatalogueItemForm } from './CatalogueItemForm';
import { CATEGORIES } from './types';
import type { CatalogItem, CatalogItemFormValues, DeleteTarget } from './types';

interface CatalogueTableProps {
  items: CatalogItem[];
  loading: boolean;
  creating: boolean;
  editingId: string | null;
  onStartCreating: () => void;
  onCreate: (data: CatalogItemFormValues) => Promise<boolean>;
  onCancelCreating: () => void;
  onStartEditing: (id: string) => void;
  onUpdate: (id: string, data: CatalogItemFormValues) => Promise<boolean>;
  onCancelEditing: () => void;
  onDeleteRequest: (target: DeleteTarget) => void;
  onReactivate: (item: CatalogItem) => void;
}

export function CatalogueTable({
  items, loading, creating, editingId,
  onStartCreating, onCreate, onCancelCreating,
  onStartEditing, onUpdate, onCancelEditing,
  onDeleteRequest, onReactivate,
}: CatalogueTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onStartCreating}>
          <Plus className="h-4 w-4" /> Ajouter un equipement
        </Button>
      </div>
      {creating && <CatalogueItemForm onSave={onCreate} onCancel={onCancelCreating} />}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm" aria-label="Catalogue des équipements">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Marque</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modele</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-5 w-12 rounded-full" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-8 w-16" /></td>
                  </tr>
                ))
              ) : items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
                  {editingId === item.id ? (
                    <td colSpan={5} className="p-3">
                      <CatalogueItemForm
                        item={item}
                        onSave={(data) => onUpdate(item.id, data)}
                        onCancel={onCancelEditing}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2">{CATEGORIES[item.category]}</td>
                      <td className="px-4 py-2">{item.brand}</td>
                      <td className="px-4 py-2">{item.model}</td>
                      <td className="px-4 py-2">
                        <Badge variant={item.active ? 'success' : 'outline'}>
                          {item.active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => onStartEditing(item.id)} aria-label={`Modifier ${item.brand} ${item.model}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {item.active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDeleteRequest({ type: 'item', id: item.id, label: `${item.brand} ${item.model}` })}
                              aria-label={`Supprimer ${item.brand} ${item.model}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => onReactivate(item)}>
                              Réactiver
                            </Button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
