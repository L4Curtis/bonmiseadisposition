import type { SignatureInvalidationReason } from '@prisma/client';
import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';
import { LINK_INVALIDATION_MESSAGES } from '../bons/bon-status';
import { effectiveInvalidationReason } from './link-invalidation';

/**
 * Fonctions pures du cycle de vie d'un lien de signature : lien invalidé
 * volontairement ou expiré, message au collaborateur, date d'expiration.
 */

/** Un lien ramené à l'epoch (cf. INVALIDATED_TOKEN_SENTINEL) a été invalidé
 *  volontairement (renvoi, passage au guichet, clôture…) ; son motif est dans
 *  `Signature.invalidatedReason`. */
export function isReplacedToken(tokenExpiresAt: Date): boolean {
  return tokenExpiresAt.getTime() <= INVALIDATED_TOKEN_SENTINEL.getTime();
}

export const EXPIRED_LINK_MESSAGE = 'Ce lien de signature a expiré : demandez un nouveau lien depuis la page de signature.';

/**
 * Message renvoyé quand un lien n'est plus utilisable : le vrai motif d'une
 * invalidation (R-038), ou l'expiration naturelle.
 */
export function unusableLinkMessage(
  sig: { tokenExpiresAt: Date; invalidatedReason?: SignatureInvalidationReason | null },
  bonStatus: string,
): string {
  if (!isReplacedToken(sig.tokenExpiresAt)) return EXPIRED_LINK_MESSAGE;
  return LINK_INVALIDATION_MESSAGES[effectiveInvalidationReason(sig.invalidatedReason, bonStatus)];
}

/** Clamp de la validité configurée (tokens.expiry_days) dans [1, 30], avec
 *  repli sur `defaultDays` si la valeur brute est absente ou non numérique. */
export function clampTokenValidityDays(raw: string | null, defaultDays: number): number {
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultDays;
  return Math.min(30, Math.max(1, parsed));
}

/**
 * Date d'expiration d'un nouveau lien : un lien présentiel (guichet) expire
 * après `inPersonValidityHours`, indépendamment de la validité configurable en
 * jours (qui ne s'applique qu'aux liens envoyés par email).
 */
export function computeTokenExpiresAt(
  isInPerson: boolean,
  options: { validityDays: number; inPersonValidityHours: number; now?: Date },
): Date {
  const now = options.now ?? new Date();
  return isInPerson
    ? new Date(now.getTime() + options.inPersonValidityHours * 60 * 60 * 1000)
    : new Date(now.getTime() + options.validityDays * 24 * 60 * 60 * 1000);
}
