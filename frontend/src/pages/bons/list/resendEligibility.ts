import { hasPendingSignature, isWaitingStatus } from '@/lib/bon-helpers';
import type { Bon } from './types';

/** Le lien de signature de ce bon peut-il être relancé depuis la liste ?
 *  Même condition que le bouton « Renvoyer le lien » de la fiche : un bon en
 *  attente de signature du collaborateur (ou une restitution partielle avec
 *  une signature en attente), et une adresse email où l'envoyer. Le serveur
 *  revérifie tout (POST /bons/:id/resend, /bons/resend-batch). */
export function canResendLink(bon: Pick<Bon, 'status' | 'signatures' | 'collaborateurEmail'>): boolean {
  if (!bon.collaborateurEmail) return false;
  return isWaitingStatus(bon.status) || hasPendingSignature(bon);
}

/** Date d'envoi du dernier lien en attente, s'il y en a un. */
export function lastLinkSentAt(bon: Pick<Bon, 'signatures'>): string | null {
  const dates = bon.signatures.filter((s) => !s.signed).map((s) => s.createdAt).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
