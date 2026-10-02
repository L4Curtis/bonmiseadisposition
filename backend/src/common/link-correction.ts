import type { SignatureInvalidationReason } from '@prisma/client';

/**
 * Le nouveau lien d'un document suit-il une correction ? L'email qui le
 * porte le dit alors (« Restitution corrigée suite à votre contestation »…)
 * au lieu d'une demande ordinaire. Module pur.
 */

/** Motifs d'invalidation qui signifient « le document a changé ». */
export type LinkCorrection = Extract<SignatureInvalidationReason, 'contested' | 'return_corrected' | 'modified'>;

const CORRECTIONS: readonly SignatureInvalidationReason[] = ['contested', 'return_corrected', 'modified'];

/** Lien précédent du même document, tel que ce module le lit. */
export interface PreviousLink {
  readonly signed: boolean;
  readonly invalidatedReason: SignatureInvalidationReason | null;
}

/**
 * Correction à annoncer, d'après les liens précédents du document, du plus
 * récent au plus ancien : on remonte jusqu'au dernier document signé (une
 * restitution d'avant appartient à un autre cycle). Un renvoi ordinaire
 * (« remplacé »), un passage au guichet ou un lien expiré n'effacent pas la
 * correction qui les précède : le collaborateur n'a encore rien signé depuis.
 */
export function correctionBeforeNewLink(previousNewestFirst: readonly PreviousLink[]): LinkCorrection | null {
  for (const link of previousNewestFirst) {
    if (link.signed) return null;
    if (link.invalidatedReason && CORRECTIONS.includes(link.invalidatedReason)) {
      return link.invalidatedReason as LinkCorrection;
    }
  }
  return null;
}

/** Lien précédent du même document, avec sa voie (email ou guichet). */
export interface PreviousLinkWithChannel extends PreviousLink {
  readonly isInPerson: boolean;
}

/**
 * Le nouveau lien par email est-il un RENVOI ? Oui si le collaborateur a déjà
 * reçu par email un lien de cette version du document : on remonte les liens
 * précédents, du plus récent au plus ancien, jusqu'au dernier document signé
 * (cycle précédent) ou à une correction (nouvelle version du document). Un
 * lien affiché au guichet n'est pas un envoi. Module pur.
 */
export function isResendOfSameDocument(previousNewestFirst: readonly PreviousLinkWithChannel[]): boolean {
  for (const link of previousNewestFirst) {
    if (link.signed) return false;
    if (link.invalidatedReason && CORRECTIONS.includes(link.invalidatedReason)) return false;
    if (!link.isInPerson) return true;
  }
  return false;
}
