/**
 * Contrats de l'API — inventaire du parc en circulation
 * (`backend/src/reporting/`, contrôleur `reporting/inventory`).
 *
 * Accès : admin, technician, direction. L'export CSV
 * (`GET /api/reporting/inventory/export`) ne renvoie pas de JSON et n'est donc
 * pas décrit ici.
 */

import type { BonStatus, EquipmentCategory, IsoDateTime } from './common';

// ─── Briques partagées (aussi utilisées par kpi.ts) ───────────────────────────

/** Situation d'un équipement du parc, dérivée du statut de son bon
 *  (common/bon-predicates.ts). */
export type EquipmentSituation = 'en_attente_signature' | 'en_circulation' | 'en_litige';

/** Statuts de bon couverts par le parc en circulation (PARC_BON_STATUSES) :
 *  seuls ces statuts peuvent apparaître dans l'inventaire. */
export type ParcBonStatus = Extract<
  BonStatus,
  'sent_mise_dispo' | 'active' | 'sent_restitution' | 'partially_returned' | 'contested'
>;

/** Répartition du parc par catégorie. Un équipement hors catalogue est
 *  compté dans `autre` (COALESCE SQL). Trié par `count` décroissant. */
export interface ParcCategoryCount {
  category: EquipmentCategory;
  /** Libellé français (CATEGORY_LABELS). */
  label: string;
  count: number;
}

/** Répartition du parc par filiale. Trié par `count` décroissant. */
export interface ParcFilialeCount {
  filialeId: string;
  /** Nom affiché de la filiale (colonne `display_name`). */
  name: string;
  count: number;
}

/** Répartition du parc par situation : toujours les trois situations, dans
 *  l'ordre en_attente_signature, en_circulation, en_litige, à 0 si absentes. */
export interface ParcSituationCount {
  situation: EquipmentSituation;
  /** Libellé français (SITUATION_LABELS). */
  label: string;
  count: number;
}

// ─── GET /api/reporting/inventory ─────────────────────────────────────────────

/** Collaborateur détenteur, tel que sélectionné sur le bon. */
export interface InventoryCollaborateur {
  id: string;
  displayName: string;
  /** Absent pour un compte créé à la main (compagnon de chantier). */
  email: string | null;
  department: string | null;
  /** État du compte (`User.active`). */
  active: boolean;
}

/** Filiale du bon. */
export interface InventoryFiliale {
  id: string;
  name: string;
  displayName: string;
}

/** Un équipement du parc en circulation (inventory-mapper.ts, `toInventoryItem`). */
export interface InventoryItem {
  /** Identifiant de la ligne `BonEquipment`. */
  equipmentId: string;
  /** « marque modèle » pour un article du catalogue, sinon le libellé libre,
   *  sinon « Équipement ». */
  label: string;
  /** `autre` pour un équipement hors catalogue. */
  category: EquipmentCategory;
  categoryLabel: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  bonId: string;
  bonReference: string;
  bonStatus: ParcBonStatus;
  situation: EquipmentSituation;
  situationLabel: string;
  /** Colonne `@db.Date` : minuit UTC du jour civil. */
  dateMiseDisposition: IsoDateTime;
  /** Colonne `@db.Date` facultative : minuit UTC du jour civil. */
  dateRestitution: IsoDateTime | null;
  collaborateur: InventoryCollaborateur;
  filiale: InventoryFiliale;
}

/** GET /api/reporting/inventory — liste paginée des équipements du parc en
 *  circulation (filtres `filialeId`, `category`, `collaborateurId`,
 *  `situation`, `overdue`, `sansNumeroSerie`, `search`, tri `sort`/`direction`).
 *  `limit` vaut 50 par défaut, 200 au plus. */
export interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

// ─── GET /api/reporting/inventory/summary ─────────────────────────────────────

/** GET /api/reporting/inventory/summary — agrégats du parc en circulation,
 *  toujours globaux (aucun filtre). La somme de `bySituation` égale `total`. */
export interface InventorySummaryResponse {
  total: number;
  byCategory: ParcCategoryCount[];
  byFiliale: ParcFilialeCount[];
  bySituation: ParcSituationCount[];
  /** Équipements dont la date de restitution prévue est dépassée (jour civil
   *  Europe/Paris). */
  overdue: number;
}

// ─── GET /api/reporting/inventory/by-collaborateur ────────────────────────────

/** Filiale commune à tout le matériel regroupé d'un collaborateur (sans `name`,
 *  contrairement à `InventoryFiliale`). */
export interface InventoryCollaborateurFiliale {
  id: string;
  displayName: string;
}

/** Une ligne par collaborateur (inventory-collaborateur-aggregate.ts). */
export interface InventoryCollaborateurItem {
  collaborateurId: string;
  displayName: string;
  email: string | null;
  department: string | null;
  /** `null` si le matériel provient de bons de plusieurs filiales. */
  filiale: InventoryCollaborateurFiliale | null;
  /** État du compte (`User.active`). */
  active: boolean;
  /** Nombre d'équipements détenus (dans le jeu filtré). */
  count: number;
  /** Nombre d'équipements en retard de restitution. */
  overdueCount: number;
  /** Colonne `@db.Date` du prêt le plus ancien : minuit UTC du jour civil. */
  oldestDateMiseDisposition: IsoDateTime;
  /** Ancienneté du prêt le plus ancien, en jours civils Europe/Paris
   *  (négative si la date est future). */
  oldestAgeDays: number;
}

/** GET /api/reporting/inventory/by-collaborateur — parc regroupé par
 *  collaborateur, paginé et trié après regroupement (`sort` = `count` ou
 *  `oldest`). Mêmes filtres que la liste, sauf `collaborateurId`, plus
 *  `compte` (`actif` | `inactif`) : la forme est identique avec
 *  `?compte=inactif`, chaque élément ayant alors `active: false`.
 *  `truncated` signale un regroupement fait sur les 10 000 premiers
 *  équipements seulement (doublé par l'en-tête `X-Truncated: true`). */
export interface InventoryByCollaborateurResponse {
  items: InventoryCollaborateurItem[];
  total: number;
  page: number;
  limit: number;
  truncated: boolean;
}
