import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SortOrder } from '@/hooks/useSort';
import type { CardSlot, ListColumn, ListSort } from './types';

export interface ListCardsProps<T, F extends string> {
  readonly items: readonly T[];
  readonly columns: readonly ListColumn<T, F>[];
  readonly getKey: (item: T) => string;
  readonly caption: string;
  readonly sort?: ListSort<F>;
  readonly renderCard?: (item: T) => ReactNode;
  readonly className?: string;
}

const ORDER_LABELS: Record<SortOrder, string> = { asc: 'croissant', desc: 'décroissant' };

/**
 * Affichage téléphone d'une liste : une carte par élément, et le tri proposé
 * par une liste déroulante (il n'y a plus d'en-têtes de colonne à toucher).
 * Utilisable seul par une liste qui compose son propre tableau.
 */
export function ListCards<T, F extends string>({
  items, columns, getKey, caption, sort, renderCard, className,
}: ListCardsProps<T, F>) {
  return (
    <div className={cn('space-y-3', className)}>
      {sort && <SortSelect columns={columns} sort={sort} />}
      <ul aria-label={caption} className="space-y-3">
        {items.map((item) => (
          <li key={getKey(item)} className="rounded-xl border border-border bg-card p-4 shadow-card">
            {renderCard ? renderCard(item) : <DefaultCard item={item} columns={columns} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DefaultCard<T, F extends string>({ item, columns }: { item: T; columns: readonly ListColumn<T, F>[] }) {
  const inSlot = (slot: CardSlot) => columns.filter((column) => (column.card ?? 'detail') === slot);
  const actions = inSlot('actions');
  return (
    <div className="space-y-2">
      {inSlot('title').map((column) => (
        <h3 key={column.key} className="text-sm font-semibold text-foreground">{column.cell(item)}</h3>
      ))}
      {inSlot('subtitle').map((column) => (
        <p key={column.key} className="text-sm text-muted-foreground">{column.cell(item)}</p>
      ))}
      <dl className="space-y-1 text-sm">
        {inSlot('detail').map((column) => (
          <div key={column.key} className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">{column.header}</dt>
            <dd className="min-w-0 break-words text-foreground">{column.cell(item)}</dd>
          </div>
        ))}
      </dl>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((column) => <div key={column.key}>{column.cell(item)}</div>)}
        </div>
      )}
    </div>
  );
}

function SortSelect<T, F extends string>({ columns, sort }: { columns: readonly ListColumn<T, F>[]; sort: ListSort<F> }) {
  const sortable = columns.filter((column): column is ListColumn<T, F> & { sortField: F } => !!column.sortField);
  if (sortable.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Trier par
      <select
        value={`${sort.field}:${sort.order}`}
        onChange={(e) => {
          const [field, order] = e.target.value.split(':');
          sort.setSort(field as F, order === 'desc' ? 'desc' : 'asc');
        }}
        className="h-11 flex-1 rounded-lg border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {sortable.flatMap((column) =>
          (['asc', 'desc'] as const).map((order) => (
            <option key={`${column.sortField}:${order}`} value={`${column.sortField}:${order}`}>
              {`${column.header} (${ORDER_LABELS[order]})`}
            </option>
          )),
        )}
      </select>
    </label>
  );
}
