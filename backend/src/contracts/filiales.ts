/**
 * Contrats de l'API — filiales (`src/filiales/`).
 *
 * Toutes les routes sont réservées à l'administrateur, sauf
 * GET /filiales/active, ouverte à l'IT et à la direction (menus du formulaire
 * de bon et des filtres), qui ne renvoie que l'identité de chaque filiale.
 */

import type { IsoDateTime } from './common';

/** Filiale : ligne complète de `filiales`, renvoyée sans `select` par Prisma
 *  (routes d'administration des filiales). */
export interface Filiale {
  id: string;
  /** Nom technique, unique sans tenir compte de la casse. */
  name: string;
  displayName: string;
  /** Chemin relatif « uploads/<fichier> », servi par GET /filiales/file/:filename. */
  logoPath: string | null;
  /** Chemin relatif « uploads/<fichier> », servi par GET /filiales/file/:filename. */
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
 *  `displayName` (administrateur). */
export type FilialeListResponse = Filiale[];

/** GET /filiales/active — les filiales actives, triées par `displayName`,
 *  réduites à leur identité (IT et direction). */
export type ActiveFilialesResponse = FilialeSummary[];

/**
 * GET /filiales/:id, POST /filiales (201), PUT /filiales/:id,
 * PATCH /filiales/:id/logo, PATCH /filiales/:id/stamp — la filiale lue,
 * créée ou modifiée.
 * DELETE /filiales/:id — la filiale supprimée physiquement, telle qu'elle
 * était juste avant sa suppression.
 */
export type FilialeResponse = Filiale;

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
