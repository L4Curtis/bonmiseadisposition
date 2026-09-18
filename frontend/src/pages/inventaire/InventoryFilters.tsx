import { Search, X } from 'lucide-react';
import type { Filiale } from '@/types';
import type { InventoryCategorySummary, InventorySituationSummary } from './types';

interface InventoryFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filialeFilter: string;
  onFilialeFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  situationFilter: string;
  onSituationFilterChange: (value: string) => void;
  situations: InventorySituationSummary[];
  filiales: Filiale[];
  categories: InventoryCategorySummary[];
  /** Filtre « en retard de restitution » activé depuis la tuile — affiché ici
   *  comme un chip refermable, la tuile n'ayant pas d'état visuel persistant. */
  overdueFilter: boolean;
  onClearOverdue: () => void;
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
  situationFilter,
  onSituationFilterChange,
  situations,
  filiales,
  categories,
  overdueFilter,
  onClearOverdue,
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

      <select
        className="field-modern h-9 px-3 cursor-pointer"
        value={situationFilter}
        onChange={(e) => onSituationFilterChange(e.target.value)}
        aria-label="Filtrer par situation"
      >
        <option value="">Toutes situations</option>
        {situations.map((s) => (
          <option key={s.situation} value={s.situation}>
            {s.label} ({s.count})
          </option>
        ))}
      </select>

      {overdueFilter && (
        <button
          onClick={onClearOverdue}
          className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
        >
          Retards uniquement
          <X className="h-3 w-3" />
        </button>
      )}

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="px-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}
