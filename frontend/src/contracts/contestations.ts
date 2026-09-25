// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/contestations.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — contestations
 * (`backend/src/contestation/contestation.controller.ts`, plus la création
 * montée sur `backend/src/bons/bons.controller.ts`).
 */
import type { BonStatus, ContestationStatus, IsoDateTime } from './common';

/** Colonnes du modèle Contestation, hors relations. */
export interface ContestationColumns {
  id: string;
  bonId: string;
  userId: string;
  message: string;
  status: ContestationStatus;
  /** Technicien qui a pris en charge ou clôturé la contestation. */
  resolvedById: string | null;
  resolutionMessage: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Collaborateur auteur de la contestation. */
export interface ContestationAuthor {
  id: string;
  displayName: string;
  email: string | null;
}

/** Technicien qui a pris en charge ou clôturé la contestation. */
export interface ContestationHandler {
  id: string;
  displayName: string;
}

/** Bon contesté, forme la plus courte (création, prise en charge). */
export interface ContestationBonRef {
  id: string;
  reference: string;
}

/** Bon contesté avec son statut (résolution). */
export interface ContestationBonWithStatus extends ContestationBonRef {
  status: BonStatus;
}

/** Bon contesté tel qu'affiché dans la liste. */
export interface ContestationListBon extends ContestationBonWithStatus {
  filiale: { displayName: string };
}

// ─── GET /api/contestations ───────────────────────────────────────────────────

/** Contestation de la liste IT. */
export interface ContestationListItem extends ContestationColumns {
  bon: ContestationListBon;
  user: ContestationAuthor;
  resolvedBy: ContestationHandler | null;
}

/** GET /api/contestations?status=&page=&limit= — liste paginée (IT), de la plus
 *  récente à la plus ancienne. `openCount` ignore les filtres et la pagination. */
export interface ContestationListResponse {
  contestations: ContestationListItem[];
  total: number;
  page: number;
  limit: number;
  openCount: number;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/** POST /api/bons/:id/contestation — contestation d'un bon actif par son
 *  titulaire (201) ; le bon passe en `contested`. */
export interface CreateContestationResponse extends ContestationColumns {
  status: 'open';
  bon: ContestationBonRef;
  user: ContestationAuthor;
}

/** PATCH /api/contestations/:id/review — prise en charge d'une contestation ouverte. */
export interface ReviewContestationResponse extends ContestationColumns {
  status: 'in_review';
  resolvedById: string;
  bon: ContestationBonRef;
  user: ContestationAuthor;
  resolvedBy: ContestationHandler;
}

/** Brouillon créé par le flux « corriger et re-signer ». */
export interface CorrectedBonRef {
  id: string;
  reference: string;
}

/** PATCH /api/contestations/:id/resolve — acceptation ou rejet. `correctedBon`
 *  vaut `null` sauf pour une acceptation avec `correct: true` (bon d'origine
 *  annulé, brouillon corrigé créé). */
export interface ResolveContestationResponse extends ContestationColumns {
  status: 'resolved' | 'rejected';
  resolvedById: string;
  bon: ContestationBonWithStatus;
  user: ContestationAuthor;
  resolvedBy: ContestationHandler;
  correctedBon: CorrectedBonRef | null;
}
