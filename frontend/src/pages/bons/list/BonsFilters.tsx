import { Search, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BON_STATUS_LABELS, type BonStatus, type Filiale } from '@/types';
import { STATUS_OPTIONS } from './statusFilterOptions';
import { SORT_FIELDS, type BonsListQuery, type SortField, type SortOrder } from './bonsListQuery';
import { BonsAdvancedFilters, type BonsAdvancedFiltersProps } from './BonsAdvancedFilters';

/** Libellés du sélecteur de tri (utile sur petit écran, où plusieurs colonnes
 *  triables sont masquées, et pour la date de création, sans colonne). */
const SORT_OPTION_LABELS: Record<SortField, { asc: string; desc: string }> = {
  createdAt: { desc: 'Création : plus récents d’abord', asc: 'Création : plus anciens d’abord' },
  updatedAt: { desc: 'Activité : plus récente d’abord', asc: 'Activité : plus ancienne d’abord' },
  dateMiseDisposition: { desc: 'Mise à disposition : plus récente d’abord', asc: 'Mise à disposition : plus ancienne d’abord' },
  reference: { asc: 'Référence : croissante', desc: 'Référence : décroissante' },
  collaborateur: { asc: 'Collaborateur : A → Z', desc: 'Collaborateur : Z → A' },
  filiale: { asc: 'Filiale : A → Z', desc: 'Filiale : Z → A' },
  // Ordre de l'enum Postgres (voir backend bons/queries/bon-order) : les
  // statuts sont regroupés, brouillons en tête, restitutions partielles en fin.
  status: { asc: 'Statut : brouillons d’abord', desc: 'Statut : restitutions partielles d’abord' },
};

export interface BonsFiltersProps {
  readonly query: BonsListQuery;
  readonly searchInput: string;
  readonly onSearchInputChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
  readonly onClearSearch: () => void;
  readonly statusSelectValue: string;
  readonly onStatusSelect: (value: string) => void;
  readonly onFilialeChange: (value: string) => void;
  readonly filiales: Filiale[];
  readonly onSortChange: (sort: SortField, order: SortOrder) => void;
  readonly onAdvancedChange: BonsAdvancedFiltersProps['onChange'];
  readonly currentUserId: string | undefined;
  readonly creators: BonsAdvancedFiltersProps['creators'];
  readonly exportLoading: boolean;
  readonly onExport: () => void;
  readonly hasActiveFilters: boolean;
  readonly onResetFilters: () => void;
  readonly onClearExcludeStatus: () => void;
}

/** Barre de filtres de la liste des bons (recherche, statut, filiale, tri,
 *  export), filtres avancés, et chip du filtre « En cours » hérité du tableau
 *  de bord (non représenté par un champ). */
export function BonsFilters({
  query,
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  onClearSearch,
  statusSelectValue,
  onStatusSelect,
  onFilialeChange,
  filiales,
  onSortChange,
  onAdvancedChange,
  currentUserId,
  creators,
  exportLoading,
  onExport,
  hasActiveFilters,
  onResetFilters,
  onClearExcludeStatus,
}: BonsFiltersProps) {
  // « En cours » a son option dans le select statut ; une autre combinaison
  // d'exclusions (lien bricolé) n'en a pas, d'où la chip.
  const showExcludeChip = !!query.excludeStatus && !statusSelectValue.startsWith('__exclude:');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 min-w-52 focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.20)] focus-within:border-[hsl(var(--primary)/0.60)] transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          <input
            className="flex-1 text-sm outline-none placeholder:text-muted-foreground/70 bg-transparent text-foreground"
            placeholder="Rechercher (réf, collaborateur, n° de série...)"
            aria-label="Rechercher un bon"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit();
            }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={onClearSearch}
              className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

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

        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={query.filialeId}
          onChange={(e) => onFilialeChange(e.target.value)}
          aria-label="Filtrer par filiale"
        >
          <option value="">Toutes les filiales</option>
          {filiales.map((f) => (
            <option key={f.id} value={f.id}>{f.displayName}</option>
          ))}
        </select>

        <select
          className="field-modern h-9 px-3 cursor-pointer"
          value={`${query.sort}:${query.order}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(':') as [SortField, SortOrder];
            onSortChange(sort, order);
          }}
          aria-label="Trier la liste"
        >
          {SORT_FIELDS.flatMap((field) => (['desc', 'asc'] as const).map((order) => (
            <option key={`${field}:${order}`} value={`${field}:${order}`}>
              {SORT_OPTION_LABELS[field][order]}
            </option>
          )))}
        </select>

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

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-sm text-destructive hover:text-destructive/80 font-medium transition-colors px-1"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <BonsAdvancedFilters
        query={query}
        onChange={onAdvancedChange}
        currentUserId={currentUserId}
        creators={creators}
      />

      {showExcludeChip && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Statuts exclus : {query.excludeStatus.split(',').map((s) => BON_STATUS_LABELS[s as BonStatus] ?? s).join(', ')}
            <button
              type="button"
              onClick={onClearExcludeStatus}
              className="hover:text-foreground transition-colors"
              aria-label="Retirer l’exclusion de statuts"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
