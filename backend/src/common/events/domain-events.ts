import type { BonStatus, SignatureType } from '@prisma/client';

/**
 * Événements du domaine : noms et charges utiles.
 *
 * Un module annonce ce qui vient de se passer ; un autre y réagit, sans que
 * l'un importe l'autre. C'est ce qui remplace le crochet « PV après
 * signature » que la signature allait chercher dans Bons par ModuleRef, et
 * c'est le chemin par lequel les actions du cycle de vie (lot 2A) déclenchent
 * les emails (lot 2B).
 *
 * Règles pour tous les événements :
 *  - on publie APRÈS la validation de la transaction, jamais dedans : un
 *    écouteur ne doit jamais voir un état que la base n'a pas gardé ;
 *  - la charge utile est figée et ne contient que des faits (identifiants,
 *    statuts, motif) : un écouteur relit la base s'il lui faut davantage ;
 *  - un écouteur est idempotent (un événement peut être rejoué) et gère ses
 *    erreurs : une panne d'écouteur est journalisée, jamais renvoyée à
 *    l'émetteur (voir DomainEventsPublisher).
 */

export const DOMAIN_EVENTS = Object.freeze({
  /** Le collaborateur a signé un document par son lien (à distance ou au guichet). */
  signatureSigned: 'signature.signed',
  /** Un bon a été annulé, avec un motif. */
  bonCancelled: 'bon.cancelled',
  /** « Constater la remise sans signature » : Remise à signer → En cours. */
  bonHandoverWithoutSignature: 'bon.handover_without_signature',
  /** « Clôturer sans signature » : → Clôturé. */
  bonClosedWithoutSignature: 'bon.closed_without_signature',
  /** Le bon remplaçant (contestation Fondée) est signé : l'original est clôturé comme remplacé. */
  bonReplaced: 'bon.replaced',
} as const);

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

/** Document que le collaborateur signe par un lien (tout sauf la signature IT). */
export type LinkDocumentType = Exclude<SignatureType, 'it_cachet'>;

/** Champs communs à tous les événements d'un bon. */
export interface BonEventBase {
  readonly bonId: string;
  readonly bonReference: string;
  /** Compte à l'origine de l'action ; `null` quand c'est le collaborateur
   *  par son lien ou une tâche automatique. */
  readonly actorId: string | null;
  /** Moment où l'action a été enregistrée en base. */
  readonly occurredAt: Date;
}

/** `signature.signed` — publié par la signature (lot 2B, signature/signing.ts). */
export interface SignatureSignedEvent extends BonEventBase {
  readonly signatureId: string;
  readonly documentType: LinkDocumentType;
  /** Statut du bon juste avant la signature. */
  readonly previousStatus: BonStatus;
  /** Statut du bon juste après (déjà écrit en base). */
  readonly newStatus: BonStatus;
  /** Compte connecté qui a signé : le collaborateur, ou le technicien qui
   *  tenait la tablette pour une signature au guichet. */
  readonly signerEmail: string;
  readonly inPerson: boolean;
  /** Signature au guichet recueillie par un autre compte que le titulaire. */
  readonly signedByProxy: boolean;
}

/** `bon.cancelled` — publié par l'annulation (lot 2A). */
export interface BonCancelledEvent extends BonEventBase {
  /** `sent_mise_dispo` : un lien avait été envoyé, le collaborateur est prévenu. */
  readonly previousStatus: BonStatus;
  readonly reason: string;
}

/** `bon.handover_without_signature` — publié par « Constater la remise sans
 *  signature » (lot 2A). Le bon est désormais « En cours ». */
export interface BonHandoverWithoutSignatureEvent extends BonEventBase {
  readonly reason: string;
}

/** `bon.closed_without_signature` — publié par « Clôturer sans signature »
 *  (lot 2A). Le bon est désormais « Clôturé ». */
export interface BonClosedWithoutSignatureEvent extends BonEventBase {
  /** Étape abandonnée : restitution à signer, restitution en cours (PV)… */
  readonly previousStatus: BonStatus;
  readonly reason: string;
}

/** `bon.replaced` — publié quand le bon remplaçant est signé et que
 *  l'original (`bonId`) passe « Clôturé » comme remplacé (lot 2A). */
export interface BonReplacedEvent extends BonEventBase {
  readonly replacementBonId: string;
  readonly replacementBonReference: string;
  /** Contestation Fondée à l'origine du remplacement, si elle est connue. */
  readonly contestationId: string | null;
}

/** Charge utile de chaque événement, par nom. */
export interface DomainEventPayloads {
  'signature.signed': SignatureSignedEvent;
  'bon.cancelled': BonCancelledEvent;
  'bon.handover_without_signature': BonHandoverWithoutSignatureEvent;
  'bon.closed_without_signature': BonClosedWithoutSignatureEvent;
  'bon.replaced': BonReplacedEvent;
}
