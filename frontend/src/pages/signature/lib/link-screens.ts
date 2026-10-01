import type { SignatureInvalidationReason } from '@/contracts/common';
import type { LinkSignatureType } from '@/contracts/bons';
import type { LinkFollowUp } from '@/contracts/signature';
import { LINK_INVALIDATION_MESSAGES } from '@/domain/labels';

/** Titre et message d'un écran de lien qui ne se signe plus. */
export interface LinkScreenText {
  title: string;
  message: string;
}

/** Titre de l'écran, par motif d'invalidation (le message vient du lexique). */
const INVALIDATION_TITLES: Readonly<Record<SignatureInvalidationReason, string>> = {
  replaced: 'Lien remplacé',
  in_person: 'Signature au guichet',
  modified: 'Bon modifié',
  return_corrected: 'Restitution corrigée',
  cancelled: 'Bon annulé',
  contested: 'Document en cours de correction',
  handover_without_signature: 'Remise enregistrée',
  closed_without_signature: 'Bon clôturé',
  account_deactivated: 'Compte désactivé',
};

/** Motif inconnu (lien invalidé avant que le motif ne soit enregistré) : on ne
 *  prétend pas qu'un nouveau lien a été envoyé. */
const UNKNOWN_REASON: LinkScreenText = {
  title: 'Lien plus valable',
  message:
    "Ce lien n'est plus valable. Si un document vous attend encore, vous le trouverez dans « Mes équipements ».",
};

/** Lien invalidé par une contestation : tant que le bon est contesté, le
 *  serveur répond « contested » (écran du bon contesté) ; un lien invalidé
 *  « contested » signifie donc que la contestation a été jugée Fondée. Tant
 *  que le document corrigé n'est pas reparti, il est « en cours de
 *  correction ». */
const CORRECTION_MESSAGE =
  "Votre contestation est fondée : l'équipe informatique corrige ce document, puis vous le renverra à signer. Ce lien n'est plus valable ; vous n'avez rien à faire d'ici là.";

/** Motifs d'un document corrigé : l'écran suit la correction jusqu'au bout. */
type CorrectionReason = 'contested' | 'return_corrected' | 'modified';

const isCorrection = (reason: SignatureInvalidationReason): reason is CorrectionReason =>
  reason === 'contested' || reason === 'return_corrected' || reason === 'modified';

/** Ce qui a été corrigé, en titre et en début de phrase. Une remise contestée
 *  est corrigée sur un nouveau bon : elle garde l'écran « en cours de
 *  correction » (voir `correctionScreen`). */
function correctedDocument(reason: CorrectionReason, documentType: LinkSignatureType): { title: string; sentence: string } {
  if (reason === 'modified') return { title: 'Bon modifié', sentence: 'Ce bon a été modifié' };
  if (documentType === 'pv_cloture') {
    return { title: 'PV de non-restitution corrigé', sentence: 'Le PV de non-restitution a été corrigé' };
  }
  return { title: 'Restitution corrigée', sentence: 'La restitution a été corrigée' };
}

/** Fin de phrase selon ce qui a suivi : jamais « un nouveau lien vous sera
 *  envoyé » si rien ne partira, jamais « vous a été envoyé » s'il n'est pas
 *  parti. */
const FOLLOW_UP_ENDINGS: Readonly<Record<LinkFollowUp, string>> = {
  link_sent: ' : un nouveau lien vous a été envoyé.',
  in_person: " : le document se signe désormais au guichet, avec l'équipe informatique.",
  link_coming: ' : un nouveau lien vous sera envoyé.',
  none: " : il n'y a plus rien à signer pour l'instant. L'équipe informatique vous recontactera si nécessaire.",
};

/** Écran d'un document corrigé (contestation Fondée, marquage corrigé, bon
 *  modifié), selon ce qui a suivi l'invalidation. */
function correctionScreen(reason: CorrectionReason, followUp: LinkFollowUp, documentType: LinkSignatureType): LinkScreenText {
  const inCorrection = reason === 'contested' && (followUp === 'link_coming' || documentType === 'mise_disposition');
  if (inCorrection) return { title: INVALIDATION_TITLES.contested, message: CORRECTION_MESSAGE };
  const { title, sentence } = correctedDocument(reason, documentType);
  const message = reason === 'return_corrected' && followUp === 'link_coming'
    ? `${sentence} par l'équipe informatique${FOLLOW_UP_ENDINGS.link_coming}`
    : `${sentence}${FOLLOW_UP_ENDINGS[followUp]}`;
  return { title, message };
}

/**
 * Écran d'un lien invalidé avant usage : le vrai motif (R-038) et, pour un
 * document corrigé, où en est la correction (`followUp`, calculé par le
 * serveur). Sans `followUp` (ancien serveur), le texte du lexique.
 */
export function invalidatedLinkScreen(
  reason: SignatureInvalidationReason | null | undefined,
  followUp?: LinkFollowUp,
  documentType: LinkSignatureType = 'restitution',
): LinkScreenText {
  if (!reason) return UNKNOWN_REASON;
  if (isCorrection(reason)) return correctionScreen(reason, followUp ?? 'link_coming', documentType);
  return { title: INVALIDATION_TITLES[reason], message: LINK_INVALIDATION_MESSAGES[reason] };
}

/** Bon annulé ou contesté : écran prioritaire sur « expiré » et « déjà signé ». */
export function closedBonScreen(status: 'cancelled' | 'contested'): LinkScreenText {
  if (status === 'contested') {
    return { title: 'Contestation en cours', message: LINK_INVALIDATION_MESSAGES.contested };
  }
  return invalidatedLinkScreen(status);
}
