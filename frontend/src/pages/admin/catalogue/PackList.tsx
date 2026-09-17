import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ChevronDown, ChevronRight, Package, Trash2, X } from 'lucide-react';
import { PackItemAdder } from './PackItemAdder';
import { CATEGORIES } from './types';
import type { CatalogItem, DeleteTarget, Pack, RemovePackItemTarget } from './types';

interface PackListProps {
  packs: Pack[];
  allItems: CatalogItem[];
  loading: boolean;
  newPackName: string;
  onNewPackNameChange: (v: string) => void;
  onCreatePack: () => void;
  expandedPack: string | null;
  onToggleExpand: (id: string | null) => void;
  pendingPackId: string | null;
  onDeleteRequest: (target: DeleteTarget) => void;
  onReactivatePack: (pack: Pack) => void;
  onAddItemToPack: (pack: Pack, item: CatalogItem, qty: number) => void;
  onUpdateItemQty: (pack: Pack, catalogItemId: string, quantity: number) => void;
  onRemoveItemRequest: (target: RemovePackItemTarget) => void;
}

export function PackList({
  packs, allItems, loading, newPackName, onNewPackNameChange, onCreatePack,
  expandedPack, onToggleExpand, pendingPackId, onDeleteRequest, onReactivatePack,
  onAddItemToPack, onUpdateItemQty, onRemoveItemRequest,
}: PackListProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Nom du pack (ex: Pack nouveau collaborateur)"
          value={newPackName}
          onChange={(e) => onNewPackNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreatePack()}
        />
        <Button size="sm" onClick={onCreatePack}>
          <Plus className="h-4 w-4" /> Creer
        </Button>
      </div>
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : packs.map((pack) => {
          const packPending = pendingPackId === pack.id;
          return (
          <Card key={pack.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 font-medium text-foreground"
                  onClick={() => onToggleExpand(expandedPack === pack.id ? null : pack.id)}
                >
                  {expandedPack === pack.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Package className="h-4 w-4 text-blue-500" />
                  {pack.name}
                  <Badge variant="outline">{pack.items.length} item(s)</Badge>
                  {!pack.active && (
                    <Badge variant="outline" className="border-red-300 text-red-600">Inactif</Badge>
                  )}
                </button>
                {pack.active ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteRequest({ type: 'pack', id: pack.id, label: pack.name })}
                    aria-label={`Supprimer le pack ${pack.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => onReactivatePack(pack)}>
                    Réactiver
                  </Button>
                )}
              </div>
              {expandedPack === pack.id && (
                <div className="mt-3 pl-4 space-y-1.5">
                  {pack.items.length === 0 && (
                    <p className="text-sm text-muted-foreground/70 pb-1">Aucun equipement -- utilisez la recherche ci-dessous</p>
                  )}
                  {pack.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                      <span className="flex-1 text-foreground/80">
                        <span className="font-medium">{item.catalogItem.brand} {item.catalogItem.model}</span>
                        <span className="ml-2 text-muted-foreground/70">{CATEGORIES[item.catalogItem.category]}</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6 text-xs"
                          disabled={packPending || item.quantity <= 1}
                          onClick={() => onUpdateItemQty(pack, item.catalogItem.id, item.quantity - 1)}
                          aria-label="Diminuer la quantité"
                        >-</Button>
                        <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="w-6 h-6 text-xs"
                          disabled={packPending}
                          onClick={() => onUpdateItemQty(pack, item.catalogItem.id, item.quantity + 1)}
                          aria-label="Augmenter la quantité"
                        >+</Button>
                      </div>
                      <button
                        className="ml-1 text-muted-foreground/70 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={packPending}
                        onClick={() => onRemoveItemRequest({
                          pack,
                          catalogItemId: item.catalogItem.id,
                          label: `${item.catalogItem.brand} ${item.catalogItem.model}`,
                        })}
                        aria-label={`Retirer ${item.catalogItem.brand} ${item.catalogItem.model} du pack`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <PackItemAdder pack={pack} allItems={allItems} onAdd={(item, qty) => onAddItemToPack(pack, item, qty)} />
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
