import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import { Boxes, X } from 'lucide-react';
import { isOverdue } from './isOverdue';
import type { InventoryItem } from './types';

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-32 hidden lg:block" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

interface InventoryTableProps {
  items: InventoryItem[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Direction : lecture seule, aucun accès aux bons individuels (/bons/:id → 403). */
  canLinkToBon: boolean;
}

/** Tableau de l'inventaire du parc prêté : gère lui-même le chargement,
 *  l'erreur et l'état vide. */
export function InventoryTable({
  items,
  loading,
  loadError,
  onRetry,
  hasActiveFilters,
  onResetFilters,
  canLinkToBon,
}: InventoryTableProps) {
  return (
    <div className="bg-card rounded-xl border border-border card-elevated overflow-hidden">
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center" role="alert">
          <div className="rounded-full bg-red-50 dark:bg-red-900/20 p-4 mb-4">
            <X className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">Erreur de chargement</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Boxes className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">
            Aucun équipement prêté ne correspond aux filtres
          </p>
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="mt-3 text-sm text-[hsl(var(--primary))] hover:opacity-80 font-medium transition-colors"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Inventaire du parc prêté">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Équipement</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">N° série</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">N° inventaire</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collaborateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Filiale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bon</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Mise à dispo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Restitution prévue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => {
                const overdue = isOverdue(it.dateRestitution);
                return (
                  <tr key={it.equipmentId} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground leading-tight">{it.label}</div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {it.categoryLabel ?? it.category}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">
                      {it.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden lg:table-cell">
                      {it.inventoryNumber || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground leading-tight">{it.collaborateur.displayName}</div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {it.collaborateur.department || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                      {it.filiale.displayName}
                    </td>
                    <td className="px-4 py-3.5">
                      {canLinkToBon ? (
                        <Link
                          to={`/bons/${it.bonId}`}
                          className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded hover:underline"
                        >
                          {it.bonReference}
                        </Link>
                      ) : (
                        <span className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded">
                          {it.bonReference}
                        </span>
                      )}
                      <div className="mt-1">
                        <StatusBadge status={it.bonStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                      {formatDate(it.dateMiseDisposition)}
                    </td>
                    <td className={`px-4 py-3.5 hidden xl:table-cell whitespace-nowrap ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {it.dateRestitution ? formatDate(it.dateRestitution) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
