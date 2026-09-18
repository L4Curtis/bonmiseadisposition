import { Fragment } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { formatDays } from '@/lib/kpi-format';
import { InventoryTable, TableSkeleton } from './InventoryTable';
import { useCollaborateurDetail } from './useCollaborateurDetail';
import type { InventoryBaseFilters } from './inventoryFilterParams';
import type { CollaborateurInventoryItem, CollaborateurSort } from './types';

interface CollaborateurTableProps {
  items: CollaborateurInventoryItem[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Direction : lecture seule — transmis tel quel au détail déplié
   *  (InventoryTable), qui rend déjà les références de bon non cliquables. */
  canLinkToBon: boolean;
  sort: CollaborateurSort;
  onSortChange: (sort: CollaborateurSort) => void;
  /** Filtres actifs, transmis au détail déplié pour rester cohérent avec la
   *  liste regroupée (cf. useCollaborateurDetail). */
  filters: InventoryBaseFilters;
  /** Le serveur a plafonné le regroupement : les chiffres sont incomplets, et
   *  on le dit — un total faux affiché comme vrai est pire qu'un avertissement. */
  truncated: boolean;
}

type AriaSort = 'ascending' | 'descending' | 'none';

function SortableHeader({
  label, active, ariaSort, onClick, className,
}: { label: string; active: boolean; ariaSort: AriaSort; onClick: () => void; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${className ?? ''}`}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        onClick={onClick}
        className={`normal-case tracking-normal transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded ${
          active ? 'text-foreground font-semibold' : 'text-muted-foreground'
        }`}
      >
        {label}
      </button>
    </th>
  );
}

/** Tableau de la vue « Par collaborateur » : une ligne par personne, dépliable
 *  pour charger et afficher son matériel (réutilise InventoryTable, filtré par
 *  collaborateurId — cf. useCollaborateurDetail.ts). Plusieurs lignes peuvent
 *  être dépliées simultanément. Gère elle-même le chargement, l'erreur et
 *  l'état vide de la liste regroupée. */
export function CollaborateurTable({
  items,
  loading,
  loadError,
  onRetry,
  hasActiveFilters,
  onResetFilters,
  canLinkToBon,
  sort,
  onSortChange,
  filters,
  truncated,
}: CollaborateurTableProps) {
  const { expandedIds, toggle, detailFor, retryDetail } = useCollaborateurDetail(filters);

  return (
    <div className="bg-card rounded-xl border border-border card-elevated overflow-hidden">
      {truncated && !loading && !loadError && (
        <div
          className="flex items-start gap-3 border-b border-border bg-[hsl(var(--warning))]/10 px-4 py-3"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
          <p className="text-xs text-muted-foreground">
            Le parc dépasse la limite de regroupement du serveur : ce classement ne porte que sur une
            partie des équipements. Affinez les filtres (filiale, catégorie) pour obtenir des chiffres
            complets.
          </p>
        </div>
      )}
      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">
            Aucun collaborateur ne correspond aux filtres
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
          <table className="w-full text-sm" aria-label="Inventaire par collaborateur">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Collaborateur
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Filiale
                </th>
                <SortableHeader
                  label="Équipements"
                  active={sort === 'count'}
                  ariaSort={sort === 'count' ? 'descending' : 'none'}
                  onClick={() => onSortChange('count')}
                />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  En retard
                </th>
                <SortableHeader
                  label="Prêt le plus ancien"
                  active={sort === 'oldest'}
                  ariaSort={sort === 'oldest' ? 'ascending' : 'none'}
                  onClick={() => onSortChange('oldest')}
                  className="hidden lg:table-cell"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => {
                const expanded = expandedIds.has(c.collaborateurId);
                const detailId = `collab-detail-${c.collaborateurId}`;
                const detail = detailFor(c.collaborateurId);
                return (
                  <Fragment key={c.collaborateurId}>
                    <tr onClick={() => toggle(c.collaborateurId)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(c.collaborateurId);
                          }}
                          className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          )}
                          <span>
                            <span className="font-medium text-foreground leading-tight block">{c.displayName}</span>
                            <span className="text-xs text-muted-foreground/70">{c.department || '—'}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell">
                        {c.filiale ? c.filiale.displayName : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-foreground font-medium">{c.count}</td>
                      <td className="px-4 py-3.5">
                        {c.overdueCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {c.overdueCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell whitespace-nowrap">
                        <div className="text-muted-foreground">{formatDate(c.oldestDateMiseDisposition)}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {`il y a ${formatDays(c.oldestAgeDays)}`}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5} id={detailId} className="bg-muted/20 p-3">
                          <InventoryTable
                            items={detail.items}
                            loading={detail.loading}
                            loadError={detail.error}
                            onRetry={() => retryDetail(c.collaborateurId)}
                            hasActiveFilters={false}
                            onResetFilters={() => undefined}
                            canLinkToBon={canLinkToBon}
                            sortDirection=""
                            onToggleDateSort={() => undefined}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
