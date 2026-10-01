import type { BonStatus } from '@prisma/client';
import type { EquipmentReturnState, LinkSignatureType, PendingSignature } from '../../contracts/bons';
import { canSendLink, CanSendLinkResult, LinkRecipient } from '../../common/can-send-link';
import { BonFacts, pendingDocument } from './state-machine';

/**
 * Faits d'un bon, calculés depuis ses équipements et ses signatures : c'est
 * ce que lit la machine à états (state-machine.ts). Module pur.
 *
 * Règle clé : un équipement rendu « attend la signature de sa restitution »
 * s'il a été marqué rendu APRÈS la dernière restitution signée. On le déduit
 * donc des dates, pas de l'existence d'une ligne de signature en attente : la
 * purge des liens expirés supprime ces lignes, pas les signatures signées.
 */

/** Équipement tel que le lit la machine à états. */
export interface FactsEquipment {
  readonly returnedAt: Date | string | null;
  readonly notReturned: boolean;
}

/** Signature telle que la lit la machine à états. */
export interface FactsSignature {
  /** Identifiant du lien (absent dans les calculs qui n'en ont pas besoin). */
  readonly id?: string;
  readonly type: string;
  readonly signed: boolean;
  readonly signedAt: Date | string | null;
  readonly tokenExpiresAt: Date | string;
  readonly createdAt: Date | string;
  readonly isInPerson: boolean;
  readonly pdfType: string | null;
  readonly invalidatedAt?: Date | string | null;
}

export interface FactsBon {
  readonly status: BonStatus;
  readonly equipments: readonly FactsEquipment[];
  readonly signatures: readonly FactsSignature[];
  readonly collaborateur: LinkRecipient;
}

const time = (value: Date | string | null | undefined): number => (value ? new Date(value).getTime() : 0);

/** Date de la dernière restitution signée par le collaborateur (0 si aucune). */
export function lastSignedRestitutionAt(signatures: readonly FactsSignature[]): number {
  return signatures
    .filter((s) => s.type === 'restitution' && s.signed)
    .reduce((latest, s) => Math.max(latest, time(s.signedAt)), 0);
}

/** Où en est chaque équipement (voir EquipmentReturnState). Un bon clôturé
 *  n'attend plus rien : ses équipements rendus sont « rendus ». */
export function equipmentReturnState(
  equipment: FactsEquipment,
  signedRestitutionAt: number,
  status: BonStatus,
): EquipmentReturnState {
  if (equipment.notReturned) return 'not_returned';
  if (!equipment.returnedAt) return 'out';
  if (status === 'archived' || status === 'cancelled') return 'returned';
  return time(equipment.returnedAt) > signedRestitutionAt ? 'returned_to_sign' : 'returned';
}

/** Un lien est valide s'il n'est ni signé, ni expiré, ni invalidé. */
export function isValidLink(signature: FactsSignature, now: number): boolean {
  return !signature.signed && !signature.invalidatedAt && time(signature.tokenExpiresAt) > now;
}

/** Dernier lien non signé d'un document (le plus récent d'abord). */
export function latestUnsignedLink(
  signatures: readonly FactsSignature[],
  document: LinkSignatureType,
): FactsSignature | null {
  return (
    signatures
      .filter((s) => s.type === document && !s.signed)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0] ?? null
  );
}

export function computeBonFacts(bon: FactsBon, now: number = Date.now()): BonFacts {
  const signedAt = lastSignedRestitutionAt(bon.signatures);
  const states = bon.equipments.map((e) => equipmentReturnState(e, signedAt, bon.status));
  const count = (state: EquipmentReturnState) => states.filter((s) => s === state).length;
  const link: CanSendLinkResult = canSendLink(bon.collaborateur);
  const partial = {
    status: bon.status,
    equipmentCount: bon.equipments.length,
    equipmentOut: count('out'),
    returnedToSign: count('returned_to_sign'),
    returnedSigned: count('returned'),
    notReturned: count('not_returned'),
    canSendLink: link.allowed,
    linkRefusalMessage: link.allowed ? null : link.message,
    hasValidLink: false,
  };
  const document = pendingDocument(partial);
  const latest = document ? latestUnsignedLink(bon.signatures, document) : null;
  return Object.freeze({ ...partial, hasValidLink: latest !== null && isValidLink(latest, now) });
}

/**
 * La signature IT du document en attente est-elle posée pour la demande en
 * cours ? Une signature IT invalidée (bon modifié, marquage annulé) ne compte
 * plus ; pour une restitution, elle doit aussi être postérieure au dernier
 * marquage « rendu » (sinon son PDF ne montrerait pas ces équipements).
 */
export function isItSignedFor(bon: FactsBon, document: LinkSignatureType): boolean {
  if (document === 'pv_cloture') return true;
  const itSignatures = bon.signatures.filter((s) => s.type === 'it_cachet' && s.signed && !s.invalidatedAt);
  if (document === 'mise_disposition') {
    return itSignatures.some((s) => s.pdfType === 'mise_disposition' || s.pdfType === null);
  }
  const signedRestitutionAt = lastSignedRestitutionAt(bon.signatures);
  const lastMarkedAt = bon.equipments
    .filter((e) => equipmentReturnState(e, signedRestitutionAt, bon.status) === 'returned_to_sign')
    .reduce((latest, e) => Math.max(latest, time(e.returnedAt)), 0);
  return itSignatures.some((s) => s.pdfType === 'restitution' && time(s.signedAt) >= lastMarkedAt);
}

/** Document en attente de signature, tel qu'exposé à l'écran (R-005, R-016). */
export function computePendingSignature(bon: FactsBon, facts: BonFacts, now: number = Date.now()): PendingSignature | null {
  const document = pendingDocument(facts);
  if (!document) return null;
  const latest = latestUnsignedLink(bon.signatures, document);
  const valid = latest !== null && isValidLink(latest, now);
  return {
    type: document,
    expired: !valid,
    inPerson: latest?.isInPerson ?? false,
    itSigned: isItSignedFor(bon, document),
    sentAt: latest ? new Date(latest.createdAt).toISOString() : null,
    expiresAt: latest && !latest.invalidatedAt && time(latest.tokenExpiresAt) > 1000
      ? new Date(latest.tokenExpiresAt).toISOString()
      : null,
  };
}
