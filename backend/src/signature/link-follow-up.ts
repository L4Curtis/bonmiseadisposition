import type { BonStatus } from '@prisma/client';
import type { LinkSignatureType } from '../contracts/bons';
import type { LinkFollowUp } from '../contracts/signature';
import { equipmentReturnState, FactsEquipment, FactsSignature, lastSignedRestitutionAt } from '../bons/workflow/bon-facts';
import { pendingDocument } from '../bons/workflow/state-machine';

/**
 * Ce qui a suivi un lien invalidé avant usage, pour que la page de
 * signature dise la vérité à chaque étape (R-038) :
 *  - `link_sent` : un nouveau lien de ce document est parti par email ;
 *  - `in_person` : le document se signe désormais au guichet ;
 *  - `link_coming` : le document attend toujours la signature du
 *    collaborateur, mais aucun nouveau lien n'est encore parti (correction ou
 *    signature IT en cours) ;
 *  - `none` : plus rien de ce document n'attend sa signature.
 * Module pur.
 */

/** Signature du bon telle que ce module la lit. */
export interface FollowUpSignature extends FactsSignature {
  readonly id: string;
}

/** Bon tel que ce module le lit. */
export interface FollowUpBon {
  readonly status: BonStatus;
  readonly equipments: readonly FactsEquipment[];
  readonly signatures: readonly FollowUpSignature[];
}

/** Lien dont on cherche la suite. */
export interface InvalidatedLink {
  readonly id: string;
  readonly type: LinkSignatureType;
  readonly createdAt: Date | string;
}

const time = (value: Date | string): number => new Date(value).getTime();

/** Document qui attend la signature du collaborateur, d'après les équipements
 *  (même règle que la machine à états). */
function awaitedDocument(bon: FollowUpBon): LinkSignatureType | null {
  const signedAt = lastSignedRestitutionAt(bon.signatures);
  const states = bon.equipments.map((e) => equipmentReturnState(e, signedAt, bon.status));
  const count = (state: string) => states.filter((s) => s === state).length;
  return pendingDocument({
    status: bon.status,
    equipmentCount: bon.equipments.length,
    equipmentOut: count('out'),
    returnedToSign: count('returned_to_sign'),
    returnedSigned: count('returned'),
    notReturned: count('not_returned'),
    canSendLink: true,
    linkRefusalMessage: null,
    hasValidLink: false,
  });
}

/** Suite donnée à un lien invalidé : le lien le plus récent du même document
 *  créé après lui, sinon ce que le bon attend encore. */
export function linkFollowUp(link: InvalidatedLink, bon: FollowUpBon): LinkFollowUp {
  const newer = bon.signatures
    .filter((s) => s.type === link.type && s.id !== link.id && time(s.createdAt) > time(link.createdAt))
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  if (newer) return newer.isInPerson ? 'in_person' : 'link_sent';
  return awaitedDocument(bon) === link.type ? 'link_coming' : 'none';
}
