import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortField, SortOrder } from './bonsListQuery';

export interface SortableHeaderProps {
  readonly field: SortField;
  readonly label: string;
  readonly currentSort: SortField;
  readonly currentOrder: SortOrder;
  readonly onSort: (field: SortField) => void;
  readonly className?: string;
  readonly align?: 'left' | 'center';
}

const TH_CLASS = 'px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider';

/** En-tête de colonne triable : `aria-sort` sur le <th> (lu par les lecteurs
 *  d'écran), et un vrai bouton pour trier au clavier comme à la souris. */
export function SortableHeader({
  field,
  label,
  currentSort,
  currentOrder,
  onSort,
  className,
  align = 'left',
}: SortableHeaderProps) {
  const active = currentSort === field;
  const ariaSort = active ? (currentOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = !active ? ArrowUpDown : currentOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={ariaSort} className={cn(TH_CLASS, align === 'center' ? 'text-center' : 'text-left', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider rounded hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

export { TH_CLASS };
