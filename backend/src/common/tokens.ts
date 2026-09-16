import * as crypto from 'crypto';

/**
 * Génère un token de signature à haute entropie (256 bits / 32 octets,
 * encodage base64url) — remplace l'ancien crypto.randomUUID() (122 bits
 * d'entropie effective) utilisé pour régénérer les tokens de rappel.
 *
 * Utilisé par SignatureService.generateToken() (lot B) pour les tokens
 * signables (mise_disposition/restitution/pv_cloture) ; signItCachet() et
 * saveItPvSignature() gardent crypto.randomUUID() pour leurs enregistrements
 * déjà-signés (jamais échangés comme secret, hors contrat de cette fonction).
 */
export function generateSignatureToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
