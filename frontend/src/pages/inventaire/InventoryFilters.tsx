import { Search, X } from 'lucide-react';
import type { Filiale } from '@/types';
import type { InventoryCategorySummary } from './types';

interface InventoryFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filialeFilter: string;
  onFilialeFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  filiales: Filiale[];
  categories: InventoryCategorySummary[];
  hasActiveFilters: boolean;
  onReset: () => void;
}

/** Barre de filtres de l'inventaire : recherche texte, filiale, catégorie. */
export function InventoryFilters({
  searchInput,
  onSearchInputChange,
  filialeFilter,
  onFilialeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  filiales,
  categories,
  hasActiveFilters,
  onReset,
}: InventoryFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.20)] focus-within:border-[hsl(var(--primary)/0.60)] transition-all">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
          placeholder="Série, inventaire, libellé, collaborateur…"
          aria-label="Rechercher un équipement"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
        />
        {searchInput && (
          <button
            onClick={() => onSearchInputChange('')}
            className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            aria-label="Effacer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <select
        className="field-modern h-9 px-3 cursor-pointer"
        value={filialeFilter}
        onChange={(e) => onFilialeFilterChange(e.target.value)}
        aria-label="Filtrer par filiale"
      >
        <option value="">Toutes les filiales</option>
        {filiales.map((f) => (
          <option key={f.id} value={f.id}>{f.displayName}</option>
        ))}
      </select>

      <select
        className="field-modern h-9 px-3 cursor-pointer"
        value={categoryFilter}
        onChange={(e) => onCategoryFilterChange(e.target.value)}
        aria-label="Filtrer par catégorie"
      >
        <option value="">Toutes catégories</option>
        {categories.map((c) => (
          <option key={c.category} value={c.category}>{c.label}</option>
        ))}
      </select>

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="text-sm text-rose-500 hover:text-rose-700 font-medium transition-colors px-1"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}
