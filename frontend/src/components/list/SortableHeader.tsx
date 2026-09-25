import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AriaSort, Sort } from '@/hooks/useSort';

/** Classe commune des en-têtes de colonne (majuscules courtes, charte des listes). */
export const TH_CLASS = 'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

export interface SortableHeaderProps<F extends string> {
  readonly field: F;
  readonly label: string;
  /** L'état de `useSort` (ou un objet de même forme). */
  readonly sort: Pick<Sort<F>, 'field' | 'order' | 'toggleSort'>;
  readonly className?: string;
  readonly align?: 'left' | 'center' | 'right';
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/**
 * En-tête de colonne triable : `aria-sort` sur le `<th>` (annoncé par les
 * lecteurs d'écran) et un vrai bouton pour trier au clavier comme à la souris.
 */
export function SortableHeader<F extends string>({
  field,
  label,
  sort,
  className,
  align = 'left',
}: SortableHeaderProps<F>) {
  const active = sort.field === field;
  const ariaSort: AriaSort = active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={ariaSort} className={cn(TH_CLASS, ALIGN[align], className)}>
      <button
        type="button"
        onClick={() => sort.toggleSort(field)}
        className={cn(
          'inline-flex items-center gap-1 rounded uppercase tracking-wider transition-colors hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}
