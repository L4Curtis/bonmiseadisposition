import { X } from 'lucide-react';
import { BON_STATUS_LABELS, type BonStatus } from '@/types';
import type { BonsListQuery, EventDayKey } from './bonsListQuery';

/** Filtre posé par un lien (tableau de bord, recherche) sans champ à l'écran :
 *  il est montré en pastille, retirable d'un geste. */
export interface FilterChip {
  readonly id: string;
  readonly label: string;
  /** Champs remis à vide quand on retire la pastille. */
  readonly clear: Partial<Pick<BonsListQuery, 'reference' | 'excludeStatus' | EventDayKey>>;
}

const EVENT_PERIODS: readonly { from: EventDayKey; to: EventDayKey; label: string }[] = [
  { from: 'createdFrom', to: 'createdTo', label: 'Créés' },
  { from: 'closedFrom', to: 'closedTo', label: 'Clôturés' },
  { from: 'cancelledFrom', to: 'cancelledTo', label: 'Annulés' },
];

/** « 2026-09-01 » → « 01/09/2026 ». */
function frenchDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

function periodLabel(prefix: string, from: string, to: string): string {
  if (from && to) return from === to ? `${prefix} le ${frenchDay(from)}` : `${prefix} du ${frenchDay(from)} au ${frenchDay(to)}`;
  return from ? `${prefix} depuis le ${frenchDay(from)}` : `${prefix} jusqu’au ${frenchDay(to)}`;
}

/** Pastilles des filtres sans champ : référence exacte, périodes de création,
 *  de clôture ou d'annulation, statuts exclus hors de l'option « En cours ». */
export function activeFilterChips(query: BonsListQuery, showExcludeStatus: boolean): FilterChip[] {
  const chips: FilterChip[] = [];
  if (query.reference) chips.push({ id: 'reference', label: `Bon ${query.reference}`, clear: { reference: '' } });
  for (const { from, to, label } of EVENT_PERIODS) {
    if (query[from] || query[to]) {
      chips.push({ id: from, label: periodLabel(label, query[from], query[to]), clear: { [from]: '', [to]: '' } });
    }
  }
  if (showExcludeStatus && query.excludeStatus) {
    const statuses = query.excludeStatus.split(',').map((s) => BON_STATUS_LABELS[s as BonStatus] ?? s).join(', ');
    chips.push({ id: 'excludeStatus', label: `Statuts exclus : ${statuses}`, clear: { excludeStatus: '' } });
  }
  return chips;
}

export interface ActiveFilterChipsProps {
  readonly chips: readonly FilterChip[];
  readonly onClear: (patch: FilterChip['clear']) => void;
}

export function ActiveFilterChips({ chips, onClear }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filtres appliqués">
      {chips.map((chip) => (
        <li
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-full bg-muted pl-3 text-xs font-medium text-muted-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onClear(chip.clear)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:text-foreground transition-colors sm:h-7 sm:w-7"
            aria-label={`Retirer le filtre « ${chip.label} »`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
