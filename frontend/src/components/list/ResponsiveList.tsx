import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { SortableHeader, TH_CLASS } from './SortableHeader';
import { ListCards } from './ListCards';
import type { ListColumn, ListSort } from './types';

export type { CardSlot, ListColumn, ListSort } from './types';

export interface ResponsiveListProps<T, F extends string = string> {
  readonly items: readonly T[];
  readonly columns: readonly ListColumn<T, F>[];
  readonly getKey: (item: T) => string;
  /** Nom de la liste pour les lecteurs d'écran (« Liste des bons »). */
  readonly caption: string;
  /** L'état de `useSort` ; sans lui, rien n'est triable. */
  readonly sort?: ListSort<F>;
  /** Carte sur mesure, quand la carte par défaut ne suffit pas. */
  readonly renderCard?: (item: T) => ReactNode;
  /**
   * `auto` (défaut) : tableau à partir de 768 px, cartes en dessous.
   * `table` / `cards` imposent un affichage (tests, écran particulier).
   */
  readonly mode?: 'auto' | 'table' | 'cards';
  readonly className?: string;
}

/**
 * Liste réutilisable : un tableau sur ordinateur, des cartes sur téléphone
 * (moins de 768 px), à partir d'une seule description des colonnes. Les états
 * chargement / vide / erreur sont à envelopper dans `ListState`, la pagination
 * à poser dessous (`Pagination`).
 *
 * Ce n'est pas un tableau « tout configurable » : une liste qui a besoin de
 * sélection multiple ou de lignes dépliables compose elle-même son tableau
 * avec `SortableHeader` et `TH_CLASS`, et garde `ListCards` pour le téléphone.
 */
export function ResponsiveList<T, F extends string = string>(props: ResponsiveListProps<T, F>) {
  const isMobile = useIsMobile();
  const mode = props.mode ?? 'auto';
  const showCards = mode === 'cards' || (mode === 'auto' && isMobile);

  if (showCards) {
    return (
      <ListCards
        items={props.items}
        columns={props.columns}
        getKey={props.getKey}
        caption={props.caption}
        sort={props.sort}
        renderCard={props.renderCard}
        className={props.className}
      />
    );
  }
  return <ListTable {...props} />;
}

function ListTable<T, F extends string>({ items, columns, getKey, caption, sort, className }: ResponsiveListProps<T, F>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-muted/30">
          <tr>
            {columns.map((column) =>
              sort && column.sortField ? (
                <SortableHeader
                  key={column.key}
                  field={column.sortField}
                  label={column.header}
                  sort={sort}
                  className={column.className}
                />
              ) : (
                <th key={column.key} scope="col" className={cn(TH_CLASS, 'text-left', column.className)}>
                  {column.header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={getKey(item)} className="transition-colors hover:bg-muted/30">
              {columns.map((column) => (
                <td key={column.key} className={cn('px-4 py-3 align-middle', column.className)}>
                  {column.cell(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
