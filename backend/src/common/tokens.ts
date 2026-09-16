import * as crypto from 'crypto';

/**
 * Génère un token de signature à haute entropie (256 bits / 32 octets,
 * encodage base64url) — remplace l'ancien crypto.randomUUID() (122 bits
 * d'entropie effective) utilisé pour régénérer les tokens de rappel.
 *
 * NOTE : signature.service.ts (hors périmètre de ce lot) génère encore ses
 * tokens séparément et devra être aligné dessus par le lot correspondant.
 */
export function generateSignatureToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
