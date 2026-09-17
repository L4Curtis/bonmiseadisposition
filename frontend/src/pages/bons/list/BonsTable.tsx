import { Plus, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import type { Bon } from './types';

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-5 w-28 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-20 hidden lg:block" />
          <Skeleton className="h-5 w-6 rounded-full hidden sm:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export interface BonsTableProps {
  readonly loading: boolean;
  readonly loadError: string | null;
  readonly bons: Bon[];
  readonly hasActiveFilters: boolean;
  readonly onRetry: () => void;
  readonly onCreateNew: () => void;
  readonly onResetFilters: () => void;
  readonly onRowClick: (bonId: string) => void;
}

/** Corps de la liste des bons : skeleton de chargement, erreur, vide, ou
 *  tableau des résultats — encapsule les 4 états mutuellement exclusifs. */
export function BonsTable({
  loading,
  loadError,
  bons,
  hasActiveFilters,
  onRetry,
  onCreateNew,
  onResetFilters,
  onRowClick,
}: BonsTableProps) {
  return (
    <div className="bg-card rounded-xl border border-border card-elevated overflow-hidden">
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        /* Erreur de chargement — distincte de l'état vide */
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
      ) : bons.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">Aucun bon trouvé</p>
          <p className="text-xs text-muted-foreground/70 max-w-xs">
            {hasActiveFilters
              ? 'Essayez de modifier vos filtres pour afficher plus de résultats.'
              : 'Il n\'y a pas encore de bons de mise à disposition. Créez le premier.'}
          </p>
          {!hasActiveFilters && (
            <Button
              size="sm"
              className="mt-4"
              onClick={onCreateNew}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Créer le premier bon
            </Button>
          )}
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
          <table className="w-full text-sm" aria-label="Liste des bons de mise à disposition">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Référence
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Collaborateur
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Filiale
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                  Équip.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bons.map((bon) => (
                <tr
                  key={bon.id}
                  className="hover:bg-muted/40 cursor-pointer transition-colors group"
                  onClick={() => onRowClick(bon.id)}
                >
                  {/* Reference */}
                  <td className="px-4 py-3.5">
                    <span className="inline-block bg-muted text-foreground/80 font-mono text-xs font-medium px-2 py-0.5 rounded">
                      {bon.reference}
                    </span>
                  </td>

                  {/* Collaborateur */}
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-foreground leading-tight">
                      {bon.collaborateur.displayName}
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">
                      {bon.collaborateur.email}
                    </div>
                  </td>

                  {/* Filiale */}
                  <td className="px-4 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                    {bon.filiale.displayName}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3.5 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                    {formatDate(bon.dateMiseDisposition)}
                  </td>

                  {/* Equipment count */}
                  <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                    <span className="inline-block text-xs bg-[hsl(var(--primary)/0.08)] dark:bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] font-medium px-2 py-0.5 rounded-full">
                      {bon.equipments.length}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <StatusBadge status={bon.status} signatures={bon.signatures} size="md" />
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xs text-muted-foreground/70 group-hover:text-[hsl(var(--primary))] font-medium transition-colors">
                      Voir
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
