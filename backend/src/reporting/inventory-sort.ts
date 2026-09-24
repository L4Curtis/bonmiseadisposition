import { Prisma } from '@prisma/client';
import { EquipmentSituation, SITUATION_BON_STATUSES, SITUATION_ORDER } from '../common/bon-predicates';
import type { PrismaService } from '../prisma/prisma.service';
import type { InventorySortField, SortDirection } from './dto/inventory-query.dto';
import { ITEM_SELECT, InventoryRow } from './inventory-mapper';

type OrderBy = Prisma.BonEquipmentOrderByWithRelationInput;

/** Sens appliqué quand `direction` est absent : croissant pour les colonnes
 *  textuelles, décroissant pour la mise à disposition (le plus récent d'abord,
 *  ordre historique de la liste). */
const DEFAULT_DIRECTION: Record<InventorySortField, SortDirection> = {
  label: 'asc',
  category: 'asc',
  serialNumber: 'asc',
  filiale: 'asc',
  collaborateur: 'asc',
  situation: 'asc',
  dateMiseDisposition: 'desc',
  dateRestitution: 'asc',
};

/** Clés de tri principales d'un champ, dans le sens demandé.
 *
 *  - `label` : le libellé affiché est « marque modèle » pour un article du
 *    catalogue, sinon le libellé libre (`customLabel`). Prisma ne sait pas
 *    trier sur un COALESCE : on trie sur marque, modèle puis libellé libre.
 *    Les équipements hors catalogue (marque NULL après la jointure externe)
 *    se regroupent donc en fin de liste en croissant, en tête en décroissant
 *    (ordre des NULL par défaut de PostgreSQL), triés entre eux.
 *  - `situation` : aucune clé ici, l'ordre vient du découpage par situation
 *    de `findSortedInventoryRows` (voir plus bas pourquoi on ne trie pas sur
 *    l'enum `BonStatus`).
 *  - `serialNumber` / `dateRestitution` : valeurs absentes toujours en fin de
 *    liste, quel que soit le sens — un matériel sans numéro ou sans date prévue
 *    n'a rien à faire en tête d'un tri. */
function primaryKeys(sort: InventorySortField, direction: SortDirection): OrderBy[] {
  switch (sort) {
    case 'label':
      return [
        { catalogItem: { brand: direction } },
        { catalogItem: { model: direction } },
        { customLabel: { sort: direction, nulls: 'last' } },
      ];
    case 'category':
      return [{ catalogItem: { category: direction } }];
    case 'serialNumber':
      return [{ serialNumber: { sort: direction, nulls: 'last' } }];
    case 'filiale':
      return [{ bon: { filiale: { displayName: direction } } }];
    case 'collaborateur':
      return [{ bon: { collaborateur: { displayName: direction } } }];
    case 'situation':
      return [];
    case 'dateRestitution':
      return [{ bon: { dateRestitution: { sort: direction, nulls: 'last' } } }];
    case 'dateMiseDisposition':
      return [{ bon: { dateMiseDisposition: direction } }];
  }
}

/**
 * `orderBy` Prisma de la liste paginée et de l'export CSV de l'inventaire
 * (une seule construction pour les deux : l'export suit toujours le tri de
 * l'écran).
 *
 * Tri stable : sans clé départageant les ex-æquo, PostgreSQL peut rendre les
 * lignes de même valeur dans un ordre différent d'une requête à l'autre, et
 * un équipement apparaîtrait alors sur deux pages (ou sur aucune). On ajoute
 * donc toujours la mise à disposition (plus récente d'abord) puis l'identifiant
 * de l'équipement, unique.
 */
export function buildInventoryOrderBy(sort?: InventorySortField, direction?: SortDirection): OrderBy[] {
  const field = sort ?? 'dateMiseDisposition';
  const primary = primaryKeys(field, direction ?? DEFAULT_DIRECTION[field]);
  const tieBreakers: OrderBy[] = [
    ...(field === 'dateMiseDisposition' ? [] : [{ bon: { dateMiseDisposition: 'desc' as const } }]),
    { id: 'asc' },
  ];
  return [...primary, ...tieBreakers];
}

/** Fenêtre de lignes à lire (pagination de la liste, ou plafond de l'export). */
export interface InventoryWindow {
  skip: number;
  take: number;
}

/**
 * Lit une fenêtre de l'inventaire filtré par `where`, dans l'ordre demandé.
 *
 * Cas particulier du tri par situation : trier sur l'enum PostgreSQL
 * `BonStatus` suivrait l'ordre physique de ses valeurs, qui n'est PAS celui
 * du schéma Prisma (`partially_returned` a été ajoutée après `contested` par
 * une migration : en base, un litige se classerait avant un retour partiel).
 * Plutôt que de dépendre de cet ordre, on lit les situations une par une
 * dans l'ordre métier (SITUATION_ORDER, inversé en décroissant) : un comptage
 * par situation, puis seulement les tranches qui recoupent la fenêtre. Au plus
 * trois comptages et trois lectures, toutes sur le même `where` que la liste.
 */
export async function findSortedInventoryRows(
  prisma: PrismaService,
  where: Prisma.BonEquipmentWhereInput,
  sort: InventorySortField | undefined,
  direction: SortDirection | undefined,
  window: InventoryWindow,
): Promise<InventoryRow[]> {
  const orderBy = buildInventoryOrderBy(sort, direction);
  if (sort !== 'situation') {
    return prisma.bonEquipment.findMany({ where, select: ITEM_SELECT, orderBy, ...window });
  }

  const situations = (direction ?? DEFAULT_DIRECTION.situation) === 'asc' ? SITUATION_ORDER : [...SITUATION_ORDER].reverse();
  const whereOf = (situation: EquipmentSituation): Prisma.BonEquipmentWhereInput => ({
    AND: [where, { bon: { status: { in: [...SITUATION_BON_STATUSES[situation]] } } }],
  });
  const counts = await Promise.all(situations.map((s) => prisma.bonEquipment.count({ where: whereOf(s) })));

  const slices = situations.flatMap((situation, i) => {
    const segmentStart = counts.slice(0, i).reduce((acc, n) => acc + n, 0);
    const from = Math.max(window.skip, segmentStart);
    const to = Math.min(window.skip + window.take, segmentStart + counts[i]);
    return to > from ? [{ situation, skip: from - segmentStart, take: to - from }] : [];
  });

  const parts = await Promise.all(
    slices.map(({ situation, skip, take }) =>
      prisma.bonEquipment.findMany({ where: whereOf(situation), select: ITEM_SELECT, orderBy, skip, take }),
    ),
  );
  return parts.flat();
}
