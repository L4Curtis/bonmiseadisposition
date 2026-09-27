import type { SignatureInvalidationReason } from '@/contracts/common';
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
 *  « contested » signifie donc que la contestation a été jugée Fondée et que
 *  le document est corrigé. Le message partagé du lexique (« en cours de
 *  traitement ») ne vaut que pour le bon encore contesté. */
const CORRECTION_MESSAGE =
  "Votre contestation est fondée : l'équipe informatique corrige ce document, puis vous le renverra à signer. Ce lien n'est plus valable ; vous n'avez rien à faire d'ici là.";

/**
 * Écran d'un lien invalidé avant usage : le vrai motif (R-038), jamais « un
 * nouveau lien vous a été envoyé » quand ce n'est pas le cas.
 */
export function invalidatedLinkScreen(reason: SignatureInvalidationReason | null | undefined): LinkScreenText {
  if (!reason) return UNKNOWN_REASON;
  if (reason === 'contested') return { title: INVALIDATION_TITLES.contested, message: CORRECTION_MESSAGE };
  return { title: INVALIDATION_TITLES[reason], message: LINK_INVALIDATION_MESSAGES[reason] };
}

/** Bon annulé ou contesté : écran prioritaire sur « expiré » et « déjà signé ». */
export function closedBonScreen(status: 'cancelled' | 'contested'): LinkScreenText {
  if (status === 'contested') {
    return { title: 'Contestation en cours', message: LINK_INVALIDATION_MESSAGES.contested };
  }
  return invalidatedLinkScreen(status);
}
