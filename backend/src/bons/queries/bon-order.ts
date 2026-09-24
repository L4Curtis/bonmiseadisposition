import { Prisma } from '@prisma/client';

/** Champs de tri autorisés sur `GET /bons` et `GET /bons/export` (liste
 *  blanche : toute autre valeur est refusée par le DTO en 400). Les noms sont
 *  ceux de l'API, pas forcément ceux des colonnes : `collaborateur` et
 *  `filiale` trient sur le nom affiché de la relation. `updatedAt` sert à la
 *  fois de « dernière modification » et de « dernière activité » (colonne de
 *  la liste) : c'est l'horodatage que fait avancer chaque étape du cycle de
 *  vie, et celui que retient déjà le filtre « en retard ». `status` suit
 *  l'ordre de l'enum Postgres, qui n'est pas celui du schéma Prisma :
 *  `partially_returned`, ajouté par une migration ultérieure, vient en
 *  dernier (draft, sent_mise_dispo, active, sent_restitution, archived,
 *  cancelled, contested, partially_returned) — le tri sert à regrouper. */
export const BON_SORT_FIELDS = [
  'reference',
  'dateMiseDisposition',
  'createdAt',
  'updatedAt',
  'status',
  'collaborateur',
  'filiale',
] as const;

export type BonSortField = (typeof BON_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

/** Tri par défaut, historique de la liste : les plus récents d'abord. */
export const DEFAULT_BON_SORT: { sort: BonSortField; order: SortOrder } = { sort: 'createdAt', order: 'desc' };

function primaryOrder(sort: BonSortField, order: SortOrder): Prisma.BonOrderByWithRelationInput {
  switch (sort) {
    case 'collaborateur':
      return { collaborateur: { displayName: order } };
    case 'filiale':
      return { filiale: { displayName: order } };
    default:
      return { [sort]: order };
  }
}

/** `orderBy` Prisma d'une liste de bons. Départage systématique par `id`
 *  (unique) : sans lui, deux bons à égalité sur le champ trié (même statut,
 *  même date…) peuvent changer d'ordre d'une requête à l'autre, et la
 *  pagination sauterait ou répéterait alors des lignes. Le sens du départage
 *  suit celui du tri, pour que « inverser le tri » inverse exactement la liste. */
export function buildBonOrderBy(
  sort: BonSortField = DEFAULT_BON_SORT.sort,
  order: SortOrder = DEFAULT_BON_SORT.order,
): Prisma.BonOrderByWithRelationInput[] {
  return [primaryOrder(sort, order), { id: order }];
}
