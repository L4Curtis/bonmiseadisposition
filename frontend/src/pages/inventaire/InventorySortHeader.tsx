import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InventorySort, InventorySortField } from './types';

const HEADER_CLASS = 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider';

type AriaSort = 'ascending' | 'descending' | 'none';

/** Sens effectif d'une colonne : sans tri choisi, l'API trie sur la mise à
 *  disposition (la plus récente d'abord) — on l'annonce, c'est l'ordre réel. */
function ariaSortOf(field: InventorySortField, sort: InventorySort | null): AriaSort {
  const effective = sort ?? { field: 'dateMiseDisposition', direction: 'desc' };
  if (effective.field !== field) return 'none';
  return effective.direction === 'asc' ? 'ascending' : 'descending';
}

interface InventorySortHeaderProps {
  field: InventorySortField;
  label: string;
  sort: InventorySort | null;
  /** Absent : colonne non triable ici (détail déplié de la vue par
   *  collaborateur, qui affiche le matériel d'une seule personne). */
  onSortChange?: (field: InventorySortField) => void;
  className?: string;
}

/** En-tête de colonne de l'inventaire, triable côté serveur : `aria-sort`
 *  sur la cellule, bouton atteignable au clavier, icône de sens. */
export function InventorySortHeader({ field, label, sort, onSortChange, className }: InventorySortHeaderProps) {
  if (!onSortChange) {
    return <th className={cn(HEADER_CLASS, className)}>{label}</th>;
  }

  const ariaSort = ariaSortOf(field, sort);
  const Icon = ariaSort === 'ascending' ? ArrowUp : ariaSort === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th className={cn(HEADER_CLASS, className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSortChange(field)}
        className={cn(
          'inline-flex items-center gap-1 normal-case tracking-normal hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded',
          ariaSort !== 'none' && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', ariaSort === 'none' && 'opacity-50')} aria-hidden="true" />
      </button>
    </th>
  );
}
