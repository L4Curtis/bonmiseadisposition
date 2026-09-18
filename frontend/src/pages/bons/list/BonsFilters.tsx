import { Search, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Filiale } from '@/types';
import { STATUS_OPTIONS } from './statusFilterOptions';

export interface BonsFiltersProps {
  readonly searchInput: string;
  readonly onSearchInputChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
  readonly onClearSearch: () => void;
  readonly statusSelectValue: string;
  readonly onStatusSelect: (value: string) => void;
  readonly filialeFilter: string;
  readonly onFilialeChange: (value: string) => void;
  readonly filiales: Filiale[];
  readonly exportLoading: boolean;
  readonly onExport: () => void;
  readonly hasActiveFilters: boolean;
  readonly onResetFilters: () => void;
  readonly excludeStatus: string;
  readonly onClearExcludeStatus: () => void;
  readonly overdue: boolean;
  readonly onClearOverdue: () => void;
}

/** Barre de filtres de la liste des bons (recherche, statut, filiale, export)
 *  et chips des filtres hérités du tableau de bord (excludeStatus, overdue). */
export function BonsFilters({
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  onClearSearch,
  statusSelectValue,
  onStatusSelect,
  filialeFilter,
  onFilialeChange,
  filiales,
  exportLoading,
  onExport,
  hasActiveFilters,
  onResetFilters,
  excludeStatus,
  onClearExcludeStatus,
  overdue,
  onClearOverdue,
}: BonsFiltersProps) {
  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.20)] focus-within:border-[hsl(var(--primary)/0.60)] transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
            placeholder="Rechercher (réf, collaborateur...)"
            aria-label="Rechercher un bon"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit();
            }}
          />
          {searchInput && (
            <button
              onClick={onClearSearch}
              className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status dropdown */}
        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={statusSelectValue}
          onChange={(e) => onStatusSelect(e.target.value)}
          aria-label="Filtrer par statut"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filiale dropdown */}
        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={filialeFilter}
          onChange={(e) => onFilialeChange(e.target.value)}
          aria-label="Filtrer par filiale"
        >
          <option value="">Toutes les filiales</option>
          {filiales.map((f) => (
            <option key={f.id} value={f.id}>{f.displayName}</option>
          ))}
        </select>

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exportLoading}
          className="border-border text-muted-foreground hover:text-foreground"
        >
          {exportLoading ? (
            <span
              className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-muted border-t-muted-foreground"
              role="status"
              aria-label="Export en cours"
            />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Exporter CSV
        </Button>

        {/* Reset filters */}
        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="text-sm text-destructive hover:text-destructive/80 font-medium transition-colors px-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Chips des filtres hérités (dashboard) non représentés par un champ */}
      {(excludeStatus || overdue) && (
        <div className="flex flex-wrap items-center gap-2 -mt-1.5">
          {excludeStatus && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              En cours (hors archivés/annulés)
              <button
                onClick={onClearExcludeStatus}
                className="hover:text-foreground transition-colors"
                aria-label="Retirer le filtre « En cours »"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive px-2.5 py-1 text-xs font-medium">
              En retard
              <button
                onClick={onClearOverdue}
                className="hover:opacity-70 transition-opacity"
                aria-label="Retirer le filtre « En retard »"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </>
  );
}
