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
import type { IsoDateTime, OkResponse } from './common';
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

/** Lien invalidé volontairement (relance, nouvelle demande) : un lien plus
 *  récent existe. */
export interface SignatureReplacedResponse {
  status: 'replaced';
  reference: string;
}

/** Lien arrivé à expiration. */
export interface SignatureExpiredResponse {
  status: 'expired';
  reference: string;
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
  /** `true` pour une signature présentielle recueillie par un autre compte
   *  que celui du titulaire (technicien sur tablette). */
  signedByProxy: boolean;
}

/** POST /api/signature/:token/sign — signature du document (200). `bonId` et
 *  `signedByProxy` sont répétés à la racine et dans `signature`. */
export interface SignDocumentResponse extends OkResponse {
  bonId: string;
  signedByProxy: boolean;
  bon: BonForSignature;
  signature: CompletedLinkSignature;
}
