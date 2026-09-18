import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, ChevronDown, ChevronRight, Package, Ban, Copy,
} from 'lucide-react';
import { PackItemAdder } from './PackItemAdder';
import { PackItemRow } from './PackItemRow';
import type {
  CatalogItem, DeactivateTarget, Pack, RemovePackItemTarget,
} from './types';

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
  onDeactivateRequest: (target: DeactivateTarget) => void;
  onReactivatePack: (pack: Pack) => void;
  onDuplicateRequest: (pack: Pack) => void;
  onAddItemToPack: (pack: Pack, item: CatalogItem, qty: number) => void;
  onUpdateItemQty: (pack: Pack, catalogItemId: string, quantity: number) => void;
  onRemoveItemRequest: (target: RemovePackItemTarget) => void;
}

export function PackList({
  packs, allItems, loading, newPackName, onNewPackNameChange, onCreatePack,
  expandedPack, onToggleExpand, pendingPackId, onDeactivateRequest, onReactivatePack,
  onDuplicateRequest, onAddItemToPack, onUpdateItemQty, onRemoveItemRequest,
}: PackListProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Nom du pack (ex: Pack nouveau collaborateur)"
          aria-label="Nom du nouveau pack"
          value={newPackName}
          onChange={(e) => onNewPackNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreatePack()}
        />
        <Button size="sm" onClick={onCreatePack}>
          <Plus className="h-4 w-4" /> Créer
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
              <div className="flex items-center justify-between gap-2">
                <button
                  className="flex items-center gap-2 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
                  onClick={() => onToggleExpand(expandedPack === pack.id ? null : pack.id)}
                  aria-expanded={expandedPack === pack.id}
                >
                  {expandedPack === pack.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Package className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  {pack.name}
                  <Badge variant="outline">{pack.items.length} item(s)</Badge>
                  {!pack.active && (
                    <Badge variant="outline" className="border-red-300 dark:border-red-900/40 text-red-600 dark:text-red-400">
                      Désactivé
                    </Badge>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDuplicateRequest(pack)}
                    aria-label={`Dupliquer le pack ${pack.name}`}
                  >
                    <Copy className="h-3.5 w-3.5" /> Dupliquer
                  </Button>
                  {pack.active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={packPending}
                      onClick={() => onDeactivateRequest({ type: 'pack', id: pack.id, label: pack.name })}
                      aria-label={`Désactiver le pack ${pack.name}`}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                    >
                      <Ban className="h-3.5 w-3.5" /> Désactiver
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={packPending} onClick={() => onReactivatePack(pack)}>
                      Réactiver
                    </Button>
                  )}
                </div>
              </div>
              {expandedPack === pack.id && (
                <div className="mt-3 pl-4 space-y-1.5">
                  {pack.items.length === 0 && (
                    <p className="text-sm text-muted-foreground/70 pb-1">
                      Aucun équipement — utilisez la recherche ci-dessous
                    </p>
                  )}
                  {pack.items.map((item) => (
                    <PackItemRow
                      key={item.id}
                      pack={pack}
                      item={item}
                      pending={packPending}
                      onUpdateQty={(catalogItemId, quantity) => onUpdateItemQty(pack, catalogItemId, quantity)}
                      onRemoveRequest={onRemoveItemRequest}
                    />
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
