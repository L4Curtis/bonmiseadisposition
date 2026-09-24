import type { BonsListQuery } from './bonsListQuery';
import type { BonCreator } from './useBonCreators';

type AdvancedPatch = Partial<Pick<BonsListQuery, 'dateFrom' | 'dateTo' | 'overdue' | 'noReturnDate' | 'createdById'>>;

export interface BonsAdvancedFiltersProps {
  readonly query: BonsListQuery;
  readonly onChange: (patch: AdvancedPatch) => void;
  readonly currentUserId: string | undefined;
  readonly creators: readonly BonCreator[];
}

const CHECKBOX_CLASS = 'h-4 w-4 rounded border-border accent-[hsl(var(--primary))] cursor-pointer';

/** Deuxième ligne de filtres : période de mise à disposition, créateur du bon,
 *  « en retard » et « sans date de restitution prévue ». */
export function BonsAdvancedFilters({ query, onChange, currentUserId, creators }: BonsAdvancedFiltersProps) {
  // Le créateur filtré peut ne plus figurer parmi les comptes actifs (compte
  // désactivé, lien partagé) : on garde alors une option pour ne pas afficher
  // un select vide alors que le filtre s'applique.
  const knownCreator = !query.createdById
    || query.createdById === currentUserId
    || creators.some((c) => c.id === query.createdById);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Période de mise à disposition</legend>
        <label htmlFor="bons-date-from" className="text-muted-foreground">Mis à disposition du</label>
        <input
          id="bons-date-from"
          type="date"
          className="field-modern h-9 px-2"
          value={query.dateFrom}
          max={query.dateTo || undefined}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
        />
        <label htmlFor="bons-date-to" className="text-muted-foreground">au</label>
        <input
          id="bons-date-to"
          type="date"
          className="field-modern h-9 px-2"
          value={query.dateTo}
          min={query.dateFrom || undefined}
          onChange={(e) => onChange({ dateTo: e.target.value })}
        />
      </fieldset>

      <select
        className="field-modern h-9 px-3 cursor-pointer"
        value={query.createdById}
        onChange={(e) => onChange({ createdById: e.target.value })}
        aria-label="Filtrer par créateur du bon"
      >
        <option value="">Créés par tout le monde</option>
        {currentUserId && <option value={currentUserId}>Créés par moi</option>}
        {!knownCreator && <option value={query.createdById}>Créés par un autre compte</option>}
        {creators
          .filter((c) => c.id !== currentUserId)
          .map((c) => (
            <option key={c.id} value={c.id}>Créés par {c.displayName}</option>
          ))}
      </select>

      <label className="inline-flex items-center gap-2 cursor-pointer text-foreground/80">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={query.overdue}
          onChange={(e) => onChange({ overdue: e.target.checked })}
        />
        En retard de signature
      </label>

      <label className="inline-flex items-center gap-2 cursor-pointer text-foreground/80">
        <input
          type="checkbox"
          className={CHECKBOX_CLASS}
          checked={query.noReturnDate}
          onChange={(e) => onChange({ noReturnDate: e.target.checked })}
        />
        Sans date de restitution prévue
      </label>
    </div>
  );
}
