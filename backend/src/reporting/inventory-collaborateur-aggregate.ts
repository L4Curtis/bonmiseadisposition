import { Prisma } from '@prisma/client';
import { daysSince, parisMidnightUtc } from './inventory-dates';
import type { CollaborateurSortField } from './dto/inventory-by-collaborateur-query.dto';

/** Sélection Prisma minimale nécessaire au regroupement par collaborateur —
 *  volontairement plus étroite que `ITEM_SELECT` (inventory-mapper.ts) : ni le
 *  détail de l'équipement (catalogue, numéros de série…) ni le bon lui-même ne
 *  sont nécessaires pour compter, dater et situer géographiquement le parc
 *  d'un collaborateur. */
export const COLLABORATEUR_GROUP_SELECT = {
  bon: {
    select: {
      dateMiseDisposition: true,
      dateRestitution: true,
      // `active` (lot D1) : expose l'état du compte sur chaque ligne
      // regroupée — alimente le filtre `?compte=` et la pastille « Compte
      // désactivé » côté interface, et sert de base à la détection des
      // départs avec matériel (departure-notifications.ts, module LDAP).
      collaborateur: { select: { id: true, displayName: true, email: true, department: true, active: true } },
      filiale: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.BonEquipmentSelect;

export type CollaborateurGroupRow = Prisma.BonEquipmentGetPayload<{ select: typeof COLLABORATEUR_GROUP_SELECT }>;

export interface CollaborateurInventoryItem {
  collaborateurId: string;
  displayName: string;
  email: string | null;
  department: string | null;
  /** Filiale commune à tout le matériel du collaborateur dans le jeu filtré,
   *  ou `null` si ce matériel provient de bons de filiales différentes
   *  (regroupement ambigu — jamais le cas quand le filtre `filialeId` est
   *  actif, puisque `buildWhere` restreint alors déjà toutes les lignes à
   *  cette filiale). */
  filiale: { id: string; displayName: string } | null;
  /** État du compte du collaborateur (`User.active`) — lot D1, alimente la
   *  pastille « Compte désactivé » et le filtre `?compte=`. */
  active: boolean;
  count: number;
  overdueCount: number;
  oldestDateMiseDisposition: Date;
  oldestAgeDays: number;
}

/**
 * Regroupe des lignes `BonEquipment` (déjà filtrées par
 * `InventoryService.buildWhere` — mêmes filtres que `/reporting/inventory`)
 * par collaborateur.
 *
 * Fait en mémoire, sur le jeu déjà filtré, plutôt qu'en SQL (`GROUP BY`
 * dédié) : la volumétrie réelle du parc en circulation est de l'ordre de
 * quelques milliers de lignes (plafonnée côté service, cf.
 * AGGREGATION_ROW_LIMIT), et un regroupement SQL séparé obligerait à
 * dupliquer `buildWhere`/`buildParcEquipmentWhere` en SQL brut — une telle
 * duplication a déjà causé un bug dans ce dépôt (voir l'audit du 2026-09-18
 * dans bon-predicates.ts). Fonction pure, testée isolément.
 */
export function groupInventoryByCollaborateur(
  rows: readonly CollaborateurGroupRow[],
  now: Date = new Date(),
): CollaborateurInventoryItem[] {
  const groups = new Map<string, CollaborateurGroupRow[]>();
  for (const row of rows) {
    const key = row.bon.collaborateur.id;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const overdueCutoff = parisMidnightUtc(now);

  return Array.from(groups.values(), (groupRows) => {
    const { collaborateur } = groupRows[0].bon;
    const filialeIds = new Set(groupRows.map((r) => r.bon.filiale.id));
    const filiale = filialeIds.size === 1 ? groupRows[0].bon.filiale : null;

    const oldestRow = groupRows.reduce((oldest, row) =>
      row.bon.dateMiseDisposition < oldest.bon.dateMiseDisposition ? row : oldest,
    );
    const overdueCount = groupRows.filter(
      (row) => row.bon.dateRestitution !== null && row.bon.dateRestitution < overdueCutoff,
    ).length;

    return {
      collaborateurId: collaborateur.id,
      displayName: collaborateur.displayName,
      email: collaborateur.email,
      department: collaborateur.department,
      filiale,
      active: collaborateur.active,
      count: groupRows.length,
      overdueCount,
      oldestDateMiseDisposition: oldestRow.bon.dateMiseDisposition,
      oldestAgeDays: daysSince(oldestRow.bon.dateMiseDisposition, now),
    };
  });
}

/** Trie une copie du regroupement (jamais en place) : `count` (défaut)
 *  décroissant — égalité départagée par ordre alphabétique du nom pour un
 *  rendu stable — ou `oldest` (prêt le plus ancien d'abord, c'est-à-dire
 *  `oldestDateMiseDisposition` croissant). */
export function sortCollaborateurGroups(
  items: readonly CollaborateurInventoryItem[],
  sort: CollaborateurSortField = 'count',
): CollaborateurInventoryItem[] {
  const copy = [...items];
  if (sort === 'oldest') {
    copy.sort((a, b) => a.oldestDateMiseDisposition.getTime() - b.oldestDateMiseDisposition.getTime());
  } else {
    copy.sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
  }
  return copy;
}
