import type { BonEquipment, LinkSignatureType } from '@/contracts/bons';
import { DOCUMENT_LABELS, LINK_INVALIDATION_MESSAGES, categoryLabel, signatureStepInSentence } from '@/domain/labels';
import { formatDateLong } from '@/lib/dates';
import type { DocumentToSign } from './portal-classification';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Bon de restitution à signer », « PV de non-restitution à signer ». */
export function documentToSignTitle(type: LinkSignatureType): string {
  return `${capitalize(DOCUMENT_LABELS[type])} à signer`;
}

/** Catégorie lisible (« PC portable »), jamais le code interne (R-091). */
export function categoryText(category: string | null | undefined): string | null {
  return category ? categoryLabel(category) : null;
}

/** Où en est un équipement, dit au collaborateur (« Chez vous », « Rendu »…).
 *  `underCorrection` : son marquage (rendu à signer, déclaré non restitué) est
 *  contesté et en cours de correction : on ne l'affirme plus. */
export function equipmentStateForCollaborator(
  eq: Partial<Pick<BonEquipment, 'returnState' | 'returnedAt' | 'notReturned'>>,
  underCorrection = false,
): {
  label: string;
  tone: 'held' | 'to_sign' | 'returned' | 'not_returned';
} {
  const state = eq.returnState ?? (eq.notReturned ? 'not_returned' : eq.returnedAt ? 'returned_to_sign' : 'out');
  if (underCorrection && (state === 'not_returned' || state === 'returned_to_sign')) {
    return { label: 'En cours de correction', tone: 'to_sign' };
  }
  if (state === 'not_returned') return { label: 'Déclaré non restitué', tone: 'not_returned' };
  if (state === 'returned_to_sign') return { label: 'Rendu — restitution à signer', tone: 'to_sign' };
  if (state === 'returned') return { label: 'Rendu', tone: 'returned' };
  return { label: 'Chez vous', tone: 'held' };
}

/** Ce que la carte d'un document à signer dit et propose. */
export type DocumentSituation =
  | { kind: 'sign'; token: string }
  | { kind: 'in_person' }
  | { kind: 'correction'; message: string }
  | { kind: 'invalidated'; message: string }
  | { kind: 'requested'; message: string }
  | { kind: 'expired'; requestToken: string | null };

/** Suite d'une contestation Fondée : une restitution ou un PV est corrigé sur
 *  le bon lui-même, une remise par un bon corrigé qui remplace celui-ci. */
function correctionMessage(type: LinkSignatureType): string {
  const next =
    type === 'mise_disposition'
      ? 'un bon corrigé va remplacer celui-ci, vous le recevrez à signer'
      : type === 'pv_cloture'
        ? `votre bon va être corrigé, puis le ${signatureStepInSentence('pv_cloture')} vous sera renvoyé à signer`
        : 'votre bon va être corrigé, puis la restitution vous sera renvoyée à signer';
  return `Votre contestation est fondée : ${next}. Vous n'avez rien à faire d'ici là.`;
}

/**
 * Situation d'un document à signer, avec le vrai motif (R-038) : un lien
 * invalidé (bon modifié, contestation Fondée…) n'est jamais présenté comme
 * « expiré », et une demande de nouveau lien déjà faite n'est pas reproposée.
 */
export function documentSituation(doc: DocumentToSign): DocumentSituation {
  if (doc.inPerson) return { kind: 'in_person' };
  if (doc.token) return { kind: 'sign', token: doc.token };
  if (doc.underCorrection) {
    return { kind: 'correction', message: correctionMessage(doc.type) };
  }
  if (doc.invalidatedReason) return { kind: 'invalidated', message: LINK_INVALIDATION_MESSAGES[doc.invalidatedReason] };
  if (doc.newLinkRequestedAt) {
    return {
      kind: 'requested',
      message: `Nouveau lien demandé le ${formatDateLong(doc.newLinkRequestedAt)} — l'équipe informatique va vous le renvoyer.`,
    };
  }
  return { kind: 'expired', requestToken: doc.requestToken };
}
