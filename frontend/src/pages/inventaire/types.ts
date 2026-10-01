/**
 * Types de la page Inventaire. Les formes renvoyées par l'API viennent des
 * contrats partagés (`@/contracts`, vérifiés par les tests de contrat du
 * serveur) ; ce fichier ne garde que l'état propre à l'écran (vue, tri,
 * filtre de compte).
 */
import type { InventorySummaryResponse, ParcSituationCount } from '@/contracts';

export type {
  EquipmentSituation,
  InventoryByCollaborateurResponse as CollaborateurInventoryResponse,
  InventoryCollaborateur,
  InventoryCollaborateurItem as CollaborateurInventoryItem,
  InventoryFiliale,
  InventoryItem,
  InventoryListMeta,
  InventoryListResponse,
  InventorySituation,
  ParcCategoryCount as InventoryCategorySummary,
  ParcFilialeCount as InventoryFilialeSummary,
} from '@/contracts';

/** Résumé du parc (tuiles et options des filtres). */
export type InventorySummary = InventorySummaryResponse;

/** Une situation du parc et son nombre d'équipements. */
export type InventorySituationSummary = ParcSituationCount;

/** Situation « Non restitué » (hors parc) : option du filtre et ligne de l'inventaire. */
export const NOT_RETURNED_SITUATION = 'non_restitue';

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

/** Bascule d'affichage de la page Inventaire — état synchronisé dans l'URL
 *  (paramètre `vue`, cf. useInventory.ts) au même titre que les filtres. */
export type InventoryView = 'equipements' | 'collaborateurs';

/** Tri de la vue « Par collaborateur » (GET /reporting/inventory/by-collaborateur) —
 *  `count` (défaut, nombre d'équipements décroissant) ou `oldest` (prêt le
 *  plus ancien d'abord). */
export type CollaborateurSort = 'count' | 'oldest';

/** Filtre sur l'état du compte du collaborateur (départ d'un collaborateur),
 *  propre à la vue « Par collaborateur ». `''` = pas de filtre. */
export type CompteFilter = '' | 'actif' | 'inactif';
