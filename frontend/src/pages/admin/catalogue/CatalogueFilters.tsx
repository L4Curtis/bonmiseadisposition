import { Search, X } from 'lucide-react';
import { CATEGORIES } from './types';
import { StatusFilterSelect } from './StatusFilterSelect';
import type { ItemStatusFilter } from './lib/statusFilter';

interface CatalogueFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  statusFilter: ItemStatusFilter;
  onStatusFilterChange: (value: ItemStatusFilter) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
}

/** Barre de filtres du catalogue : recherche texte (anti-rebond géré par
 *  {@link ../useCatalogueFilters}), filtre par catégorie et filtre d'état
 *  (masque les équipements désactivés par défaut). */
export function CatalogueFilters({
  searchInput, onSearchInputChange, categoryFilter, onCategoryFilterChange,
  statusFilter, onStatusFilterChange, hasActiveFilters, onReset,
}: CatalogueFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/60 transition-all">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
          placeholder="Marque, modèle, description…"
          aria-label="Rechercher un équipement du catalogue"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
        />
        {searchInput && (
          <button
            onClick={() => onSearchInputChange('')}
            className="text-muted-foreground/70 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
            aria-label="Effacer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <select
        className="field-modern h-9 px-3 cursor-pointer"
        value={categoryFilter}
        onChange={(e) => onCategoryFilterChange(e.target.value)}
        aria-label="Filtrer par catégorie"
      >
        <option value="">Toutes catégories</option>
        {Object.entries(CATEGORIES).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

      <StatusFilterSelect value={statusFilter} onChange={onStatusFilterChange} label="Filtrer par état" />

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="text-sm text-destructive hover:opacity-80 font-medium transition-colors px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}
