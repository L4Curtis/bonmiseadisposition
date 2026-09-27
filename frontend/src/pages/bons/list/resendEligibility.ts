import type { Bon } from './types';

/**
 * Le lien de ce bon peut-il être renvoyé depuis la liste ? Tout vient du
 * serveur (machine à états) : un document attend la signature du
 * collaborateur, un email peut lui parvenir (compte actif, adresse
 * délivrable), et la signature IT du document est posée — sans elle, c'est
 * depuis la fiche qu'on signe puis qu'on envoie. Le serveur revérifie tout.
 */
export function canResendLink(bon: Pick<Bon, 'pendingSignature' | 'canSendLink'>): boolean {
  const pending = bon.pendingSignature;
  return !!pending && pending.itSigned && bon.canSendLink === true;
}

/** Date d'envoi du dernier lien du document en attente, s'il y en a un. */
export function lastLinkSentAt(bon: Pick<Bon, 'pendingSignature'>): string | null {
  return bon.pendingSignature?.sentAt ?? null;
}
