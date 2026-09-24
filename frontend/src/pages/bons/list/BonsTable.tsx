import { useEffect, useRef } from 'react';
import { Plus, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Bon } from './types';
import type { SortField, SortOrder } from './bonsListQuery';
import { SortableHeader, TH_CLASS } from './SortableHeader';
import { BonRow } from './BonRow';
import type { BonsSelection } from './useBonsSelection';

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

/** Case « tout sélectionner » : état intermédiaire quand une partie de la
 *  page seulement est cochée (propriété DOM, sans attribut HTML équivalent). */
function SelectAllCheckbox({ selection }: { readonly selection: BonsSelection }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selection.someSelected;
  }, [selection.someSelected]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 cursor-pointer rounded border-border accent-[hsl(var(--primary))]"
      checked={selection.allSelected}
      onChange={selection.toggleAll}
      aria-label="Sélectionner tous les bons de la page"
    />
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
  readonly sort: SortField;
  readonly order: SortOrder;
  readonly onSort: (field: SortField) => void;
  readonly selection: BonsSelection;
  readonly onResend: (bon: Bon) => void;
  readonly resendLoadingId: string | null;
  readonly resendBusy: boolean;
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
  sort,
  order,
  onSort,
  selection,
  onResend,
  resendLoadingId,
  resendBusy,
}: BonsTableProps) {
  const header = { currentSort: sort, currentOrder: order, onSort };

  return (
    <div className="bg-card rounded-xl border border-border card-elevated overflow-hidden">
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        /* Erreur de chargement — distincte de l'état vide */
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center" role="alert">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <X className="h-8 w-8 text-destructive" />
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
            <Button size="sm" className="mt-4" onClick={onCreateNew}>
              <Plus className="mr-1.5 h-4 w-4" />
              Créer le premier bon
            </Button>
          )}
          {hasActiveFilters && (
            <button
              type="button"
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
                <th scope="col" className="w-10 pl-4 pr-0 py-3">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <SortableHeader field="reference" label="Référence" {...header} />
                <SortableHeader field="collaborateur" label="Collaborateur" {...header} />
                <SortableHeader field="filiale" label="Filiale" className="hidden md:table-cell" {...header} />
                <SortableHeader field="dateMiseDisposition" label="Mise à dispo." className="hidden lg:table-cell" {...header} />
                <th scope="col" className={`${TH_CLASS} text-center hidden sm:table-cell`}>
                  Équip.
                </th>
                <SortableHeader field="status" label="Statut" {...header} />
                <SortableHeader field="updatedAt" label="Dernière activité" className="hidden md:table-cell" {...header} />
                <th scope="col" className={`${TH_CLASS} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bons.map((bon) => (
                <BonRow
                  key={bon.id}
                  bon={bon}
                  selected={selection.selectedIds.has(bon.id)}
                  onToggleSelected={selection.toggle}
                  onResend={onResend}
                  resendLoading={resendLoadingId === bon.id}
                  resendDisabled={resendBusy}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
