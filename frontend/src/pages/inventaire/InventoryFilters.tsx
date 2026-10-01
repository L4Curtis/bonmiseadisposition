import { Search, ScanBarcode, Tag, UserX, X } from 'lucide-react';
import type { Filiale } from '@/types';
import { LATENESS_LABELS } from '@/domain/labels';
import type { CompteFilter, InventoryCategorySummary, InventorySituationSummary } from './types';

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
  /** Équipements encore non restitués : option « Non restitué » (hors parc). */
  notReturnedCount: number | null;
  filiales: Filiale[];
  categories: InventoryCategorySummary[];
  /** Filtre « en retard de restitution » activé depuis la tuile — affiché ici
   *  comme un chip refermable, la tuile n'ayant pas d'état visuel persistant. */
  overdueFilter: boolean;
  onClearOverdue: () => void;
  /** Qualité des données : matériel sans numéro de série, qu'on ne pourra ni
   *  retracer (/materiel) ni rapprocher d'un autre outil. Commun aux deux vues
   *  et transmis à l'export. */
  missingSerialFilter: boolean;
  onMissingSerialFilterChange: (value: boolean) => void;
  /** Qualité des données : matériel saisi en texte libre, hors Catalogue. */
  offCatalogFilter: boolean;
  onOffCatalogFilterChange: (value: boolean) => void;
  /** Lot D1 (départ d'un collaborateur) : bascule « comptes désactivés
   *  uniquement », propre à la vue « Par collaborateur » (cf. Inventaire.tsx). */
  compteFilter: CompteFilter;
  onCompteFilterChange: (value: CompteFilter) => void;
  showCompteFilter: boolean;
  hasActiveFilters: boolean;
  onReset: () => void;
}

const TOGGLE_CLASS = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:min-h-0';
const TOGGLE_ON = 'border-warning/40 bg-warning/10 text-warning';
const TOGGLE_OFF = 'border-border bg-card text-muted-foreground hover:text-foreground';

/** Barre de filtres de l'inventaire : recherche texte, filiale, catégorie,
 *  situation (« Non restitué » compris), retards, sans numéro de série, hors
 *  catalogue, comptes désactivés. */
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
  notReturnedCount,
  filiales,
  categories,
  overdueFilter,
  onClearOverdue,
  missingSerialFilter,
  onMissingSerialFilterChange,
  offCatalogFilter,
  onOffCatalogFilterChange,
  compteFilter,
  onCompteFilterChange,
  showCompteFilter,
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
        <option value="non_restitue">
          {notReturnedCount === null ? 'Non restitué' : `Non restitué (${notReturnedCount})`}
        </option>
      </select>

      {overdueFilter && (
        <button
          type="button"
          onClick={onClearOverdue}
          aria-label={`Retirer le filtre « ${LATENESS_LABELS.return} »`}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15 sm:min-h-0"
        >
          {LATENESS_LABELS.return}
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onMissingSerialFilterChange(!missingSerialFilter)}
        aria-pressed={missingSerialFilter}
        title="Matériel qu'on ne pourra ni retracer ni rapprocher d'un autre outil"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          missingSerialFilter
            ? 'border-warning/40 bg-warning/10 text-warning'
            : 'border-border bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        <ScanBarcode className="h-3.5 w-3.5" aria-hidden="true" />
        Sans numéro de série
      </button>

      <button
        type="button"
        onClick={() => onOffCatalogFilterChange(!offCatalogFilter)}
        aria-pressed={offCatalogFilter}
        title="Matériel saisi en texte libre, sans article du Catalogue"
        className={`${TOGGLE_CLASS} ${offCatalogFilter ? TOGGLE_ON : TOGGLE_OFF}`}
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        Hors catalogue
      </button>

      {showCompteFilter && (
        <button
          type="button"
          onClick={() => onCompteFilterChange(compteFilter === 'inactif' ? '' : 'inactif')}
          aria-pressed={compteFilter === 'inactif'}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            compteFilter === 'inactif'
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
          Comptes désactivés uniquement
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
