/**
 * Contrats de l'API — contestations (`backend/src/contestation/contestation.controller.ts`).
 *
 * Une contestation porte sur UN document du bon (`contestedDocument`) : la
 * remise (bon « En cours »), la restitution (à signer) ou le PV de
 * non-restitution (à signer). Elle se tranche en « Fondée » ou « Non
 * retenue » (`outcome`), jamais autrement ; `status` reste aligné
 * (`resolved` = Fondée, `rejected` = Non retenue) pour les listes et les
 * indicateurs.
 *
 * « Pris en charge par » (`reviewedBy`) et « tranché par » (`resolvedBy`) sont
 * deux personnes distinctes, chacune avec sa date.
 */
import type { BonStatus, ContestationOutcome, ContestationStatus, IsoDateTime } from './common';
import type { LinkSignatureType } from './bons';

/** Colonnes du modèle Contestation, hors relations. */
export interface ContestationColumns {
  id: string;
  bonId: string;
  userId: string;
  message: string;
  status: ContestationStatus;
  /** Statut du bon au moment de la contestation, rétabli quand elle est
   *  tranchée. `null` pour une contestation antérieure à la vague 2 (le bon
   *  était alors forcément « En cours »). */
  previousBonStatus: BonStatus | null;
  /** Document contesté : remise, restitution ou PV de non-restitution
   *  (`null` : contestation antérieure à la vague 2, donc la remise). */
  contestedDocument: LinkSignatureType | null;
  /** Issue : « Fondée » / « Non retenue » ; `null` tant qu'elle n'est pas
   *  tranchée. */
  outcome: ContestationOutcome | null;
  /** « Pris en charge par ». */
  reviewedById: string | null;
  reviewedAt: IsoDateTime | null;
  /** « Tranché par » : renseigné seulement quand l'issue est décidée. */
  resolvedById: string | null;
  resolvedAt: IsoDateTime | null;
  /** Réponse de l'équipe informatique au collaborateur (obligatoire pour
   *  « Non retenue »). */
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

/** Technicien qui a pris en charge ou tranché la contestation. */
export interface ContestationHandler {
  id: string;
  displayName: string;
}

/** Bon contesté, forme la plus courte (création). */
export interface ContestationBonRef {
  id: string;
  reference: string;
}

/** Bon contesté avec son statut (prise en charge, décision). */
export interface ContestationBonWithStatus extends ContestationBonRef {
  status: BonStatus;
}

/** Bon contesté tel qu'affiché dans la liste. */
export interface ContestationListBon extends ContestationBonWithStatus {
  filiale: { displayName: string };
}

/** Bon remplaçant créé par une contestation Fondée. */
export interface ReplacementBonRef {
  id: string;
  reference: string;
  status: BonStatus;
}

/** Contestation avec ses personnes : auteur, « pris en charge par »,
 *  « tranché par ». */
export interface ContestationWithPeople extends ContestationColumns {
  user: ContestationAuthor;
  reviewedBy: ContestationHandler | null;
  resolvedBy: ContestationHandler | null;
}

// ─── GET /api/contestations ───────────────────────────────────────────────────

/** Contestation de la liste IT. */
export interface ContestationListItem extends ContestationWithPeople {
  bon: ContestationListBon;
}

/** GET /api/contestations?status=&page=&limit= — liste paginée (IT), de la plus
 *  récente à la plus ancienne. `status` accepte une valeur ou une liste séparée
 *  par des virgules (`open,in_review` : « À traiter »). `total` compte la liste
 *  filtrée (pagination) ; les trois compteurs ignorent filtres et pagination. */
export interface ContestationListResponse {
  contestations: ContestationListItem[];
  total: number;
  page: number;
  limit: number;
  /** Contestations nouvelles, que personne n'a prises en charge (pastille du menu). */
  openCount: number;
  /** Contestations pas encore tranchées (nouvelles + prises en charge). */
  pendingCount: number;
  /** Contestations pas encore tranchées depuis plus de `overdueAfterDays`
   *  jours ouvrés. */
  overdueCount: number;
  /** Délai, en jours ouvrés (samedi et dimanche exclus), au-delà duquel une
   *  contestation non tranchée est en retard (et relancée par email à
   *  l'équipe informatique). */
  overdueAfterDays: number;
  /** Seuil de retard calculé par le serveur : une contestation non tranchée
   *  reçue avant cet instant est en retard (`overdueAfterDays` jours ouvrés
   *  avant maintenant, à la même heure de Paris). */
  overdueSince: IsoDateTime;
}

// ─── GET /api/contestations/mine ──────────────────────────────────────────────

/** Contestation vue par son auteur : jamais le nom des techniciens, jamais de
 *  note interne. */
export interface MyContestation {
  id: string;
  bon: ContestationBonRef;
  contestedDocument: LinkSignatureType | null;
  message: string;
  status: ContestationStatus;
  outcome: ContestationOutcome | null;
  createdAt: IsoDateTime;
  /** Prise en charge par l'équipe informatique : quand. */
  reviewedAt: IsoDateTime | null;
  /** Décision : quand. */
  resolvedAt: IsoDateTime | null;
  resolutionMessage: string | null;
  /** Bon corrigé qui remplace le bon contesté (contestation Fondée). */
  replacementBon: ContestationBonRef | null;
}

/** GET /api/contestations/mine — contestations du compte connecté, de la plus
 *  récente à la plus ancienne (100 au plus). Ouverte à tout rôle. */
export type MyContestationsResponse = MyContestation[];

// ─── Actions ──────────────────────────────────────────────────────────────────

/** POST /api/bons/:id/contestation — contestation d'un document par le
 *  titulaire du bon (201) ; le bon passe en `contested`. Corps :
 *  `{ message, document? }` ; `document`, s'il est donné, doit être le
 *  document réellement contestable (sinon 409). */
export interface CreateContestationResponse extends ContestationColumns {
  status: 'open';
  contestedDocument: LinkSignatureType;
  previousBonStatus: BonStatus;
  bon: ContestationBonRef;
  user: ContestationAuthor;
}

/** PATCH /api/contestations/:id/review — prise en charge d'une contestation
 *  nouvelle : « pris en charge par » la personne connectée. */
export interface ReviewContestationResponse extends ContestationWithPeople {
  status: 'in_review';
  reviewedById: string;
  reviewedAt: IsoDateTime;
  reviewedBy: ContestationHandler;
  bon: ContestationBonWithStatus;
}

/** Document qu'une contestation Fondée fait corriger sur le bon d'origine. */
export type ReopenedDocument = 'restitution' | 'pv_cloture';

/** PATCH /api/contestations/:id/resolve — décision. Corps : `{ outcome:
 *  'founded' | 'not_retained', resolutionMessage? }` (réponse obligatoire pour
 *  « Non retenue »). Le bon reprend son statut d'avant la contestation. Pour
 *  une contestation Fondée, un seul des deux champs suivants est renseigné :
 *   - remise contestée : `replacementBon`, le bon corrigé créé en brouillon
 *     pour la remplacer (l'original est clôturé « remplacé » quand il est
 *     signé) ;
 *   - restitution ou PV contesté : `reopenedDocument`, le document que l'IT
 *     corrige sur le bon d'origine puis renvoie à signer (aucun nouveau bon). */
export interface ResolveContestationResponse extends ContestationWithPeople {
  status: 'resolved' | 'rejected';
  outcome: ContestationOutcome;
  resolvedById: string;
  resolvedAt: IsoDateTime;
  resolvedBy: ContestationHandler;
  bon: ContestationBonWithStatus;
  replacementBon: ReplacementBonRef | null;
  reopenedDocument: ReopenedDocument | null;
}
