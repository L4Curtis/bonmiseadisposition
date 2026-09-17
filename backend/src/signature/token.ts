import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';

/**
 * Fonctions pures liées au cycle de vie d'un token de signature : lecture de
 * la sémantique « remplacé » vs « expiré », et calcul de la date d'expiration
 * à la création. Extrait de SignatureService (lot de découpage) sans aucun
 * changement de comportement.
 */

/** Un token ramené à l'epoch (cf. INVALIDATED_TOKEN_SENTINEL) a été invalidé
 *  volontairement (relance, nouvelle demande, clôture) : un lien plus récent
 *  existe. */
export function isReplacedToken(tokenExpiresAt: Date): boolean {
  return tokenExpiresAt.getTime() <= INVALIDATED_TOKEN_SENTINEL.getTime();
}

/** Message affiché quand un token n'est plus utilisable : distingue un lien
 *  remplacé (nouveau lien envoyé) d'une expiration naturelle. */
export function expiredMessage(tokenExpiresAt: Date): string {
  return isReplacedToken(tokenExpiresAt)
    ? 'Ce lien a été remplacé par un nouveau lien de signature : ouvrez le dernier email reçu'
    : 'Ce lien de signature a expiré';
}

/** Clamp de la validité configurée (tokens.expiry_days) dans [1, 30], avec
 *  repli sur `defaultDays` si la valeur brute est absente ou non numérique. */
export function clampTokenValidityDays(raw: string | null, defaultDays: number): number {
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultDays;
  return Math.min(30, Math.max(1, parsed));
}

/**
 * Date d'expiration d'un nouveau token. Contrat isInPerson (lot B) : un lien
 * présentiel expire après `inPersonValidityHours`, indépendamment de la
 * validité configurable en jours (qui ne s'applique qu'aux liens email).
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
