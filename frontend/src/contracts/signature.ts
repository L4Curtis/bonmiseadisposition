// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/signature.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — signature par lien (`backend/src/signature/signature.controller.ts`).
 *
 * Les deux routes exigent une session (SSO ou compte local). Le détail du bon
 * n'est renvoyé qu'au destinataire du lien, ou à tout compte connecté pour une
 * signature présentielle (signature/recipient.ts).
 */
import type { IsoDateTime, OkResponse, SignatureInvalidationReason } from './common';
import type { BonForSignature, LinkSignatureType, SafeSignature, SignaturePdfType } from './bons';

// ─── GET /api/signature/:token ────────────────────────────────────────────────

/** Le compte connecté n'est pas le destinataire du lien : aucune donnée, pas
 *  même la référence du bon. */
export interface SignatureUnauthorizedResponse {
  status: 'unauthorized';
}

/** Bon annulé ou contesté : prioritaire sur « déjà signé » et « expiré ». */
export interface SignatureBonClosedResponse {
  status: 'cancelled' | 'contested';
  reference: string;
}

/** Lien déjà utilisé. */
export interface SignatureAlreadySignedResponse {
  status: 'already_signed';
  reference: string;
  bonId: string;
}

/** Lien invalidé volontairement avant usage (le statut garde son nom
 *  historique). `invalidatedReason` donne le vrai motif (R-038) : la page de
 *  signature affiche le message correspondant (`LINK_INVALIDATION_MESSAGES`). */
export interface SignatureReplacedResponse {
  status: 'replaced';
  reference: string;
  /** Toujours renseigné par le serveur : motif enregistré, ou, pour un lien
   *  invalidé avant la vague 2, motif déduit de l'état du bon. Facultatif le
   *  temps de la vague 2, obligatoire ensuite. */
  invalidatedReason?: SignatureInvalidationReason | null;
  /** Document du lien (remise, restitution, PV). */
  documentType: LinkSignatureType;
  /** Ce qui a suivi l'invalidation (signature/link-follow-up.ts) : la page ne
   *  dit « un nouveau lien vous a été envoyé » que s'il est parti, et « vous
   *  sera envoyé » que si le document attend encore. */
  followUp: LinkFollowUp;
}

/** Suite d'un lien invalidé : nouveau lien parti par email, document à signer
 *  au guichet, nouveau lien encore à venir (correction ou signature IT en
 *  cours), ou plus rien à signer pour ce document. */
export type LinkFollowUp = 'link_sent' | 'in_person' | 'link_coming' | 'none';

/** Lien arrivé à expiration. La page propose « Demander un nouveau lien »
 *  (POST /api/signature/:token/request-new-link). */
export interface SignatureExpiredResponse {
  status: 'expired';
  reference: string;
  /** Date de la demande de nouveau lien faite pour CE lien (reconnue par
   *  l'identifiant du lien, enregistré dans le journal), ou `null`. */
  newLinkRequestedAt: IsoDateTime | null;
}

/** Signature du lien, en attente : jamais le cachet IT, jamais signée. */
export interface PendingLinkSignature extends SafeSignature {
  type: LinkSignatureType;
  signed: false;
}

/** Lien valide et en attente : le bon complet et la signature attendue. */
export interface SignaturePendingResponse {
  status: 'pending';
  bon: BonForSignature;
  signature: PendingLinkSignature;
}

/** GET /api/signature/:token — état du lien (signature/bon-info.ts), union
 *  discriminée par `status`. 404 si le jeton est inconnu. */
export type SignatureInfoResponse =
  | SignatureUnauthorizedResponse
  | SignatureBonClosedResponse
  | SignatureAlreadySignedResponse
  | SignatureReplacedResponse
  | SignatureExpiredResponse
  | SignaturePendingResponse;

// ─── POST /api/signature/:token/sign ──────────────────────────────────────────

/** Signature qui vient d'être apposée par lien (signature/signing.ts). */
export interface CompletedLinkSignature extends SafeSignature {
  type: LinkSignatureType;
  signed: true;
  signedAt: IsoDateTime;
  /** Recopie du type de la signature. */
  pdfType: SignaturePdfType;
  bonId: string;
  /** `true` pour une signature au guichet faite par un mandataire : un autre
   *  compte que celui du titulaire, qui n'est pas un compte IT. */
  signedByProxy: boolean;
  /** `true` pour une signature au guichet sur l'appareil d'un compte IT
   *  (technicien, admin) : le titulaire signe lui-même, « en présence de »
   *  ce compte. Jamais `true` en même temps que `signedByProxy`. */
  witnessedByIt: boolean;
}

/** POST /api/signature/:token/sign — signature du document (200). `bonId`,
 *  `signedByProxy` et `witnessedByIt` sont répétés à la racine et dans `signature`. */
export interface SignDocumentResponse extends OkResponse {
  bonId: string;
  signedByProxy: boolean;
  witnessedByIt: boolean;
  bon: BonForSignature;
  signature: CompletedLinkSignature;
}

// ─── POST /api/signature/:token/request-new-link ──────────────────────────────

/** POST /api/signature/:token/request-new-link — lien expiré : l'équipe
 *  informatique est prévenue par email (R-058). 200 ; 400 si le lien n'est pas
 *  expiré (encore valable, invalidé — le message dit alors le vrai motif —,
 *  lien au guichet, bon clôturé) ; 403 pour un autre compte que le destinataire
 *  (message sans aucune adresse) ; 404 si le jeton est inconnu. */
export interface RequestNewLinkResponse extends OkResponse {
  /** `requested` : l'équipe vient d'être prévenue ; `already_requested` : une
   *  demande existe déjà pour ce lien (tant que l'IT ne l'a pas renvoyé : un
   *  renvoi crée un autre lien), l'équipe n'est pas réalertée ; `requestedAt`
   *  est alors la date de cette première demande. */
  status: 'requested' | 'already_requested';
  requestedAt: IsoDateTime;
}
