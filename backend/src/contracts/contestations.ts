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
import type { ApiErrorBody, BonStatus, ContestationOutcome, ContestationStatus, IsoDateTime, ListResponse } from './common';
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

/** Compteurs de l'en-tête de la liste (`meta`) : ils ignorent filtres et
 *  pagination. */
export interface ContestationListMeta {
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

/** GET /api/contestations?status=&aTraiter=&page=&limit= — liste paginée (IT),
 *  de la plus récente à la plus ancienne, à la forme commune des listes
 *  (`limit` : 25, 50 ou 100). `status` accepte une valeur ou une liste séparée
 *  par des virgules (`open,in_review`) ; `aTraiter=1` : les contestations à
 *  traiter, avec le prédicat de la tuile de l'accueil. Compteurs dans `meta`. */
export type ContestationListResponse = ListResponse<ContestationListItem, ContestationListMeta>;

// ─── GET /api/me/contestations ────────────────────────────────────────────────

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

/** GET /api/me/contestations (ancien chemin : /api/contestations/mine) —
 *  contestations du compte connecté, de la plus récente à la plus ancienne.
 *  Liste complète, coupée à 100 (`truncated`). Ouverte à tout rôle. */
export type MyContestationsResponse = ListResponse<MyContestation>;

// ─── Erreurs ──────────────────────────────────────────────────────────────────

/**
 * Codes d'erreur propres aux contestations (409), en plus des codes communs :
 *  - `contestation_already_open` : une contestation attend déjà une décision
 *    sur ce bon ;
 *  - `contestation_already_handled` : un autre membre de l'équipe l'a prise en
 *    charge ou tranchée entre-temps (l'écran recharge la liste).
 * Le bon ou le document qui a changé depuis l'affichage répond `conflict`.
 */
export type ContestationErrorCode = 'contestation_already_open' | 'contestation_already_handled';

/** `details` d'un 409 `contestation_already_handled` : où en est la
 *  contestation, et qui l'a prise en charge ou tranchée (`null` : inconnu). */
export interface ContestationAlreadyHandledDetails {
  status: ContestationStatus;
  outcome: ContestationOutcome | null;
  by: string | null;
}

/** POST /api/contestations/:id/review et /resolve — 409 : un collègue l'a
 *  prise en charge ou tranchée entre-temps ; le message le dit en clair
 *  (« … déjà prise en charge par Marc Petit. »). */
export interface ContestationAlreadyHandledErrorBody
  extends ApiErrorBody<'contestation_already_handled', ContestationAlreadyHandledDetails> {
  details: ContestationAlreadyHandledDetails;
}

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

/** POST /api/contestations/:id/review (ancien verbe : PATCH) — prise en charge
 *  d'une contestation nouvelle : « pris en charge par » la personne connectée.
 *  Déjà prise en charge ou tranchée : 409 `contestation_already_handled`. */
export interface ReviewContestationResponse extends ContestationWithPeople {
  status: 'in_review';
  reviewedById: string;
  reviewedAt: IsoDateTime;
  reviewedBy: ContestationHandler;
  bon: ContestationBonWithStatus;
}

/** Document qu'une contestation Fondée fait corriger sur le bon d'origine. */
export type ReopenedDocument = 'restitution' | 'pv_cloture';

/** POST /api/contestations/:id/resolve (ancien verbe : PATCH) — décision. Corps : `{ outcome:
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
