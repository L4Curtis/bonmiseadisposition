import { BonStatus } from '../common/types';
import { statusAfterSignature } from '../bons/workflow/state-machine';
import type { LinkSignatureType } from '../contracts/bons';

/** Journal facultatif (garde ce module pur, sans dépendance à Nest). */
export interface StatusTransitionLogger {
  warn(message: string): void;
}

const LINK_DOCUMENTS: readonly string[] = ['mise_disposition', 'restitution', 'pv_cloture'];

/**
 * Statut d'un bon après la signature d'un document par le collaborateur.
 * La règle vit dans la machine à états du cycle de vie
 * (bons/workflow/state-machine.ts, `statusAfterSignature`) : ce module la
 * présente à la signature (signature/signing.ts), qui écrit le statut dans sa
 * transaction puis publie `signature.signed`.
 *
 * Une signature hors de son statut (lien d'un autre temps) ne fait pas
 * avancer le bon : le statut courant est renvoyé et un avertissement journalisé.
 */
export function getNextBonStatus(
  currentStatus: string,
  signatureType: string,
  logger?: StatusTransitionLogger,
  hasNotReturnedEquipment = false,
): BonStatus | string {
  if (!LINK_DOCUMENTS.includes(signatureType)) return currentStatus;
  const next = statusAfterSignature(currentStatus as BonStatus, signatureType as LinkSignatureType, hasNotReturnedEquipment);
  if (next === null) {
    logger?.warn(
      `Transition de statut invalide : ${currentStatus} via une signature ${signatureType}. Statut conservé.`,
    );
    return currentStatus;
  }
  return next;
}
