import type { BonStatus } from '@/types';

export interface InventoryCollaborateur {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
  /** État du compte (`User.active`) — pastille « Compte désactivé » sur la
   *  vue par équipement, comme sur la vue par collaborateur. */
  active: boolean;
}

export interface InventoryFiliale {
  id: string;
  name: string;
  displayName: string;
}

/** Situation d'un équipement du parc, dérivée du statut de son bon
 *  (backend : common/bon-predicates.ts). Un matériel remis dont le bon attend
 *  encore la signature fait partie du parc, distingué des autres. */
export type EquipmentSituation = 'en_attente_signature' | 'en_circulation' | 'en_litige';

export interface InventorySituationSummary {
  situation: EquipmentSituation;
  label: string;
  count: number;
}

/** Sens de tri d'une colonne de la vue par équipement. */
export type SortDirection = 'asc' | 'desc';

/** Colonnes triables de la vue par équipement — miroir de la liste blanche
 *  du backend (INVENTORY_SORT_FIELDS, inventory-query.dto.ts ; toute autre
 *  valeur y est refusée). `category` y est accepté mais n'a pas de colonne. */
export const INVENTORY_SORT_FIELDS = [
  'label',
  'serialNumber',
  'collaborateur',
  'filiale',
  'situation',
  'dateMiseDisposition',
  'dateRestitution',
] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

/** Tri choisi dans le tableau ; `null` = ordre par défaut de l'API (mise à
 *  disposition, la plus récente d'abord). */
export interface InventorySort {
  field: InventorySortField;
  direction: SortDirection;
}

export interface InventoryItem {
  equipmentId: string;
  label: string;
  category: string;
  categoryLabel?: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  bonId: string;
  bonReference: string;
  bonStatus: BonStatus;
  situation: EquipmentSituation;
  situationLabel: string;
  dateMiseDisposition: string;
  dateRestitution: string | null;
  collaborateur: InventoryCollaborateur;
  filiale: InventoryFiliale;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface InventoryCategorySummary {
  category: string;
  label: string;
  count: number;
}

export interface InventoryFilialeSummary {
  filialeId: string;
  name: string;
  count: number;
}

export interface InventorySummary {
  total: number;
  byCategory: InventoryCategorySummary[];
  byFiliale: InventoryFilialeSummary[];
  bySituation: InventorySituationSummary[];
  overdue: number;
}

/** Bascule d'affichage de la page Inventaire — état synchronisé dans l'URL
 *  (paramètre `vue`, cf. useInventory.ts) au même titre que les filtres. */
export type InventoryView = 'equipements' | 'collaborateurs';

/** Tri de la vue « Par collaborateur » (GET /reporting/inventory/by-collaborateur) —
 *  `count` (défaut, nombre d'équipements décroissant) ou `oldest` (prêt le
 *  plus ancien d'abord). */
export type CollaborateurSort = 'count' | 'oldest';

/** Filtre sur l'état du compte du collaborateur (lot D1 — départ d'un
 *  collaborateur), propre à la vue « Par collaborateur ». `''` = pas de
 *  filtre. */
export type CompteFilter = '' | 'actif' | 'inactif';

export interface CollaborateurInventoryItem {
  collaborateurId: string;
  displayName: string;
  email: string | null;
  department: string | null;
  filiale: InventoryFiliale | null;
  /** État du compte (`User.active`) — alimente la pastille « Compte désactivé ». */
  active: boolean;
  count: number;
  overdueCount: number;
  oldestDateMiseDisposition: string;
  oldestAgeDays: number;
}

export interface CollaborateurInventoryResponse {
  items: CollaborateurInventoryItem[];
  total: number;
  page: number;
  limit: number;
  /** Le regroupement portait sur plus d'équipements que la limite serveur
   *  (10 000) : les chiffres affichés sont incomplets. Toujours signalé à
   *  l'utilisateur plutôt que laissé silencieux. */
  truncated: boolean;
}
