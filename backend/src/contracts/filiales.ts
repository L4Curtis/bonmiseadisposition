/**
 * Contrats de l'API — filiales (`src/filiales/`).
 *
 * Toutes les routes sont réservées à l'administrateur, sauf
 * GET /filiales/active, ouverte à l'IT et à la direction (menus du formulaire
 * de bon et des filtres), qui ne renvoie que l'identité de chaque filiale.
 * Exports CSV nommés par le serveur, datés du jour à Paris
 * (`filiales-AAAA-MM-JJ.csv`).
 */

import type { IsoDateTime, ListResponse } from './common';

/** Filiale : ligne complète de `filiales`, renvoyée sans `select` par Prisma
 *  (routes d'administration des filiales). */
export interface Filiale {
  id: string;
  /** Nom technique, unique sans tenir compte de la casse. */
  name: string;
  displayName: string;
  /** Chemin relatif « uploads/<fichier> ». Aucune route ne sert ce fichier :
   *  il n'est imprimé que sur les PDF. */
  logoPath: string | null;
  /** Chemin relatif « uploads/<fichier> » du cachet, imprimé sur les PDF ;
   *  jamais renvoyé à un collaborateur ni à la direction. */
  stampPath: string | null;
  address: string | null;
  siret: string | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Identité d'une filiale, sans cachet, logo, adresse ni SIRET : forme de
 *  GET /filiales/active et de la filiale rattachée à un utilisateur. */
export interface FilialeSummary {
  id: string;
  name: string;
  displayName: string;
  active: boolean;
}

/** GET /filiales — toutes les filiales, actives et inactives, triées par
 *  `displayName` (administrateur), en une seule page. */
export type FilialeListResponse = ListResponse<Filiale>;

/**
 * Filtre d'état de GET /filiales/export (`status`) : `active`, les filiales
 * actives seulement, comme l'écran par défaut ; `all` (défaut), désactivées
 * comprises. `images=1` ajoute logos et cachets encodés en base64.
 */
export type FilialesExportStatus = 'active' | 'all';

/** GET /filiales/active — les filiales actives, triées par `displayName`,
 *  réduites à leur identité (IT et direction), en une seule page. */
export type ActiveFilialesResponse = ListResponse<FilialeSummary>;

/**
 * GET /filiales/:id, POST /filiales (201), PUT /filiales/:id,
 * PATCH /filiales/:id/logo, PATCH /filiales/:id/stamp — la filiale lue,
 * créée ou modifiée.
 * DELETE /filiales/:id — la filiale supprimée physiquement, telle qu'elle
 * était juste avant sa suppression.
 * Chaque écriture est tracée au journal d'audit (création, modification,
 * désactivation, réactivation, suppression, cachet, logo).
 */
export type FilialeResponse = Filiale;

/**
 * Codes d'erreur propres aux filiales (en plus de `CommonApiErrorCode`) :
 *  - `filiale_name_taken` (409) : nom déjà pris (sans tenir compte de la casse) ;
 *  - `filiale_in_use` (409) : suppression refusée, des bons ou des comptes y
 *    sont rattachés (`details.bonCount`, `details.userCount`) : la désactiver ;
 *  - `file_missing` (400) : envoi de logo ou de cachet sans fichier.
 */
export type FilialeErrorCode = 'filiale_name_taken' | 'filiale_in_use' | 'file_missing';

/** Ligne rejetée d'un import : `index` est la position dans le tableau
 *  `items` envoyé ; `message` concatène les erreurs de validation ou décrit
 *  l'image refusée. */
export interface FilialeImportError {
  index: number;
  message: string;
}

/**
 * POST /filiales/import (201) — compte rendu de l'import en masse.
 * `updated` compte les filiales existantes réellement modifiées ; `skipped`
 * compte les filiales inchangées et les lignes de commentaire (`#…`).
 */
export interface FilialeImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: FilialeImportError[];
}
