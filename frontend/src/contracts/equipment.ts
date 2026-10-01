// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/equipment.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — matériel : catalogue, packs, historique d'un matériel
 * et conflits de numéros de série (`src/equipment/`).
 *
 * Toutes les routes exigent un compte admin ou technicien, sauf
 * `GET /equipment/history`, ouverte aussi à la direction.
 */

import type { BonStatus, EquipmentCategory, IsoDateTime, ListResponse, PageSize } from './common';

// ─── Catalogue ────────────────────────────────────────────────────────────────

/** Article du catalogue : ligne complète de `equipment_catalog`, renvoyée
 *  sans `select` par Prisma. */
export interface CatalogItem {
  id: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  description: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * GET /equipment/catalog — tout le catalogue, actifs et désactivés, trié par
 * catégorie, marque puis modèle, en une seule page.
 */
export type CatalogListResponse = ListResponse<CatalogItem>;

/**
 * GET /equipment/catalog/:id, POST /equipment/catalog (201),
 * PUT /equipment/catalog/:id — l'article lu, créé ou modifié.
 * DELETE /equipment/catalog/:id — l'article désactivé (`active: false`) :
 * la suppression est logique, la ligne reste en base.
 */
export type CatalogItemResponse = CatalogItem;

/** Ligne rejetée d'un import : `index` est la position dans le tableau
 *  `items` envoyé, `message` concatène les erreurs de validation. */
export interface CatalogImportError {
  index: number;
  message: string;
}

/**
 * POST /equipment/catalog/import (201) — compte rendu de l'import en masse.
 * `updated` compte les articles désactivés réactivés ; `skipped` compte les
 * articles déjà actifs et les lignes de commentaire (`#…`).
 */
export interface CatalogImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: CatalogImportError[];
}

// ─── Packs ────────────────────────────────────────────────────────────────────

/** Pack seul, sans ses articles : ligne complète de `equipment_packs`. */
export interface PackRecord {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Ligne de composition d'un pack (`equipment_pack_items`), avec l'article
 *  de catalogue complet (`include: { catalogItem: true }`). */
export interface PackItem {
  id: string;
  packId: string;
  catalogItemId: string;
  quantity: number;
  order: number;
  catalogItem: CatalogItem;
}

/** Pack avec ses articles. */
export interface Pack extends PackRecord {
  items: PackItem[];
}

/**
 * GET /equipment/packs — tous les packs, actifs et désactivés, triés par
 * nom, en une seule page ; les articles de chaque pack sont triés par `order`.
 */
export type PackListResponse = ListResponse<Pack>;

/**
 * GET /equipment/packs/:id, POST /equipment/packs (201),
 * PUT /equipment/packs/:id — le pack avec ses articles. Seul GET trie les
 * articles par `order` ; POST et PUT les renvoient sans tri explicite.
 * Un pack créé sans `items` arrive avec `items: []`.
 */
export type PackResponse = Pack;

/** DELETE /equipment/packs/:id — le pack désactivé (`active: false`), avec
 *  ses articles triés par `order` : la suppression est logique. */
export type DeletePackResponse = Pack;

// ─── Historique d'un matériel ─────────────────────────────────────────────────

/** Paramètres de GET /equipment/history : `q` est comparé, sans tenir compte
 *  de la casse, au n° de série OU au n° d'inventaire. Vide ou absent, la
 *  réponse est vide. `page` ≥ 1, `limit` 25, 50 ou 100 (400 sinon). */
export interface EquipmentHistoryQuery {
  q?: string;
  page?: number;
  limit?: PageSize;
}

/** Bon sur lequel figure le matériel, réduit aux champs de l'historique. */
export interface EquipmentHistoryBon {
  id: string;
  reference: string;
  status: BonStatus;
  dateMiseDisposition: IsoDateTime;
  dateRestitution: IsoDateTime | null;
  collaborateur: {
    displayName: string;
    email: string | null;
  };
  filiale: {
    displayName: string;
  };
}

/** Situation de l'équipement sur ce bon (backend/src/equipment/equipment-holding.ts) :
 *  `planned` brouillon (rien de remis), `handover_to_sign` remis, remise à
 *  signer, `with_collaborateur` chez le collaborateur, `returned` rendu,
 *  `not_returned` déclaré non restitué, `cancelled` bon annulé, `closed` bon
 *  clôturé sans trace de retour. */
export type EquipmentHolding =
  | 'planned'
  | 'handover_to_sign'
  | 'with_collaborateur'
  | 'returned'
  | 'not_returned'
  | 'cancelled'
  | 'closed';

/** Une apparition du matériel sur un bon. */
export interface EquipmentHistoryEntry {
  /** Identifiant de la ligne `bon_equipments`. */
  equipmentId: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  /** « marque modèle » pour un article du catalogue, sinon le libellé libre
   *  de la ligne, qui peut être `null`. */
  label: string | null;
  returnedAt: IsoDateTime | null;
  notReturned: boolean;
  holding: EquipmentHolding;
  bon: EquipmentHistoryBon;
}

/**
 * GET /equipment/history?q=&page=&limit= — une page des bons où ce matériel
 * apparaît, du plus récent au plus ancien ; `total` est le nombre réel
 * d'apparitions.
 * L'ancien chemin GET /equipment/serial-history?q= est un alias déprécié de
 * cette route (même traitement, mêmes droits, en-têtes `Deprecation` et `Link`).
 *
 * GET /equipment/history/export?q= — tout l'historique en CSV,
 * `historique-equipement-AAAA-MM-JJ.csv` (date de Paris), coupé à 5 000
 * lignes (`X-Truncated: true`) : `meta.exportLimit` annonce ce plafond à
 * l'écran, qui prévient avant l'export.
 */
export interface EquipmentHistoryMeta {
  /** Plafond de lignes de l'export CSV de l'historique. */
  exportLimit: number;
}

export type EquipmentHistoryResponse = ListResponse<EquipmentHistoryEntry, EquipmentHistoryMeta>;

// ─── Conflits de numéros de série ─────────────────────────────────────────────

/**
 * Paramètres de GET /equipment/serial-conflicts :
 *  - `serials` : numéros séparés par des virgules ; chaque numéro est nettoyé
 *    (espaces), les vides et les doublons sont écartés, 50 au plus sont
 *    vérifiés ;
 *  - `excludeBonId` : bon à ignorer (le bon en cours d'édition).
 */
export interface SerialConflictsQuery {
  serials?: string;
  excludeBonId?: string;
}

/** Statuts d'un bon « en circulation », seuls retenus pour un conflit. */
export type CirculatingBonStatus = Exclude<BonStatus, 'archived' | 'cancelled'>;

/** Numéro déjà présent, non rendu, sur un autre bon en circulation. */
export interface SerialConflict {
  /** Tel qu'enregistré sur le bon existant (la casse peut différer de la
   *  saisie). Jamais `null` : seules les lignes dont le numéro correspond
   *  sont retenues. */
  serialNumber: string;
  bonId: string;
  bonReference: string;
  bonStatus: CirculatingBonStatus;
  /** Nom affiché du collaborateur du bon. */
  collaborateur: string;
}

/**
 * GET /equipment/serial-conflicts?serials=a,b&excludeBonId= — avertissement
 * non bloquant, en une seule page. `truncated` vaut `true` quand plus de 50
 * numéros distincts ont été fournis (seuls les 50 premiers sont vérifiés).
 */
export type SerialConflictsResponse = ListResponse<SerialConflict>;

/**
 * Codes d'erreur propres au matériel (en plus de `CommonApiErrorCode`) :
 *  - `catalog_item_exists` (409) : même catégorie, marque et modèle ;
 *  - `catalog_item_locked` (409) : article d'un bon déjà envoyé, sa
 *    catégorie, sa marque et son modèle ne changent plus ;
 *  - `catalog_item_in_use` (409) : désactivation refusée, l'article est sur un
 *    bon en cours (`details.bonCount`) ou dans un pack actif
 *    (`details.packCount`) ;
 *  - `pack_items_unavailable` (400) : article introuvable ou désactivé
 *    (`details.catalogItemIds`).
 */
export type EquipmentErrorCode = 'catalog_item_exists' | 'catalog_item_locked' | 'catalog_item_in_use' | 'pack_items_unavailable';
