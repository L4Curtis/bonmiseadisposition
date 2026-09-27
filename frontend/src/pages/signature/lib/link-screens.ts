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
  cancelled: 'Bon annulé',
  contested: 'Contestation en cours',
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

/**
 * Écran d'un lien invalidé avant usage : le vrai motif (R-038), jamais « un
 * nouveau lien vous a été envoyé » quand ce n'est pas le cas.
 */
export function invalidatedLinkScreen(reason: SignatureInvalidationReason | null | undefined): LinkScreenText {
  if (!reason) return UNKNOWN_REASON;
  return { title: INVALIDATION_TITLES[reason], message: LINK_INVALIDATION_MESSAGES[reason] };
}

/** Bon annulé ou contesté : écran prioritaire sur « expiré » et « déjà signé ». */
export function closedBonScreen(status: 'cancelled' | 'contested'): LinkScreenText {
  return invalidatedLinkScreen(status);
}
