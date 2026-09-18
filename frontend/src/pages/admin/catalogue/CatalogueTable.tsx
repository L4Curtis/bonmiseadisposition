import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pencil, Ban, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { CatalogueItemForm } from './CatalogueItemForm';
import { CatalogueEmptyState } from './CatalogueEmptyState';
import { CATEGORIES } from './types';
import type { CatalogueSortKey, SortDirection } from './lib/search';
import type { CatalogItem, CatalogItemFormValues, DeactivateTarget } from './types';

interface CatalogueTableProps {
  items: CatalogItem[];
  totalCount: number;
  hasInactiveItems: boolean;
  loading: boolean;
  creating: boolean;
  editingId: string | null;
  pendingItemId: string | null;
  sortKey: CatalogueSortKey;
  sortDirection: SortDirection;
  onSort: (key: CatalogueSortKey) => void;
  onCreate: (data: CatalogItemFormValues) => Promise<boolean>;
  onCancelCreating: () => void;
  onStartEditing: (id: string) => void;
  onUpdate: (id: string, data: CatalogItemFormValues) => Promise<boolean>;
  onCancelEditing: () => void;
  onDeactivateRequest: (target: DeactivateTarget) => void;
  onReactivate: (item: CatalogItem) => void;
  onAddEquipment: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  onResetFilters: () => void;
}

interface SortableHeaderProps {
  label: string;
  sortKey: CatalogueSortKey;
  activeKey: CatalogueSortKey;
  direction: SortDirection;
  onSort: (key: CatalogueSortKey) => void;
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort }: SortableHeaderProps) {
  const isActive = sortKey === activeKey;
  const Icon = isActive ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="px-4 py-3 text-left font-medium text-muted-foreground"
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-foreground' : 'text-muted-foreground/50 dark:text-muted-foreground/40'}`} />
      </button>
    </th>
  );
}

export function CatalogueTable({
  items, totalCount, hasInactiveItems, loading, creating, editingId, pendingItemId,
  sortKey, sortDirection, onSort,
  onCreate, onCancelCreating,
  onStartEditing, onUpdate, onCancelEditing,
  onDeactivateRequest, onReactivate,
  onAddEquipment, onImport, onDownloadTemplate, onResetFilters,
}: CatalogueTableProps) {
  // Colonne Statut affichée seulement si des équipements désactivés sont
  // effectivement visibles dans la liste filtrée — inutile quand ils sont
  // masqués par le filtre d'état (cas par défaut).
  const columnCount = hasInactiveItems ? 5 : 4;

  return (
    <div className="space-y-3">
      {creating && <CatalogueItemForm onSave={onCreate} onCancel={onCancelCreating} />}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm" aria-label="Catalogue des équipements">
            <thead className="border-b bg-muted/40">
              <tr>
                <SortableHeader label="Catégorie" sortKey="category" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                <SortableHeader label="Marque" sortKey="brand" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                <SortableHeader label="Modèle" sortKey="model" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                {hasInactiveItems && (
                  <SortableHeader label="Statut" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                )}
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
                    {hasInactiveItems && <td className="px-4 py-2"><Skeleton className="h-5 w-16 rounded-full" /></td>}
                    <td className="px-4 py-2"><Skeleton className="h-8 w-16" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="p-0">
                    <CatalogueEmptyState
                      variant={totalCount === 0 ? 'empty-catalogue' : 'no-results'}
                      onAddEquipment={onAddEquipment}
                      onImport={onImport}
                      onDownloadTemplate={onDownloadTemplate}
                      onResetFilters={onResetFilters}
                    />
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="group border-b last:border-0 hover:bg-muted/40">
                  {editingId === item.id ? (
                    <td colSpan={columnCount} className="p-3">
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
                      <td className="px-4 py-2 max-w-xs">
                        <div className="font-medium text-foreground">{item.model}</div>
                        {item.description && (
                          <div
                            className="truncate text-xs text-muted-foreground/70"
                            title={item.description}
                          >
                            {item.description}
                          </div>
                        )}
                      </td>
                      {hasInactiveItems && (
                        <td className="px-4 py-2">
                          {!item.active && (
                            <Badge variant="outline" className="border-destructive/40 text-destructive">
                              Désactivé
                            </Badge>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStartEditing(item.id)}
                            aria-label={`Modifier ${item.brand} ${item.model}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {item.active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pendingItemId === item.id}
                              onClick={() => onDeactivateRequest({ type: 'item', id: item.id, label: `${item.brand} ${item.model}` })}
                              aria-label={`Désactiver ${item.brand} ${item.model}`}
                              className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                            >
                              <Ban className="h-3.5 w-3.5" /> Désactiver
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pendingItemId === item.id}
                              onClick={() => onReactivate(item)}
                            >
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
