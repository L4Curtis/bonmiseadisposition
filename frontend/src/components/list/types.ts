import type { ReactNode } from 'react';
import type { Sort } from '@/hooks/useSort';

/**
 * Place d'une colonne dans la carte mobile :
 * - `title` : en tête de carte, en gras (référence, nom) ;
 * - `subtitle` : sous le titre ;
 * - `detail` : ligne « libellé : valeur » (par défaut) ;
 * - `actions` : boutons en bas de carte, sans libellé ;
 * - `hidden` : absente de la carte (information secondaire).
 */
export type CardSlot = 'title' | 'subtitle' | 'detail' | 'actions' | 'hidden';

/** Une colonne : son en-tête, sa cellule, et sa place dans la carte mobile. */
export interface ListColumn<T, F extends string = string> {
  readonly key: string;
  /** En-tête du tableau, et étiquette de la valeur dans la carte. */
  readonly header: string;
  readonly cell: (item: T) => ReactNode;
  /** Champ de tri : l'en-tête devient triable quand la liste reçoit `sort`. */
  readonly sortField?: F;
  /** Classes de la cellule et de l'en-tête (largeur, alignement…). */
  readonly className?: string;
  /** Place dans la carte mobile ; par défaut `detail` (« libellé : valeur »). */
  readonly card?: CardSlot;
}

/** Ce dont une liste a besoin de `useSort`. */
export type ListSort<F extends string> = Pick<Sort<F>, 'field' | 'order' | 'toggleSort' | 'setSort'>;
