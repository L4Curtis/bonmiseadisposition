import type { SignatureInvalidationReason } from '@prisma/client';
import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';

/**
 * Invalidation d'un lien de signature : son échéance est ramenée à l'epoch,
 * et le motif est enregistré (R-038) pour que la page de signature dise ce
 * qui s'est réellement passé (« remplacé », « signé au guichet »,
 * « clôturé »…) au lieu d'un « un nouveau lien vous a été envoyé » faux.
 */

/** Colonnes à écrire pour invalider un lien, avec son motif. */
export function invalidationData(reason: SignatureInvalidationReason, now: Date = new Date()) {
  return { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: reason };
}

/** Liens encore vivants (valides ou expirés naturellement) : ni signés, ni
 *  déjà invalidés. Une seconde invalidation n'écrase jamais le premier motif. */
export const LIVE_LINK_WHERE = {
  signed: false,
  invalidatedAt: null,
  tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
} as const;

/** Motif d'un lien invalidé : celui enregistré, ou, pour un lien invalidé
 *  avant que le motif ne soit tracé, celui qui se déduit de l'état du bon. */
export function effectiveInvalidationReason(
  stored: SignatureInvalidationReason | null | undefined,
  bonStatus: string,
): SignatureInvalidationReason {
  if (stored) return stored;
  if (bonStatus === 'cancelled') return 'cancelled';
  if (bonStatus === 'contested') return 'contested';
  if (bonStatus === 'archived') return 'closed_without_signature';
  return 'replaced';
}
