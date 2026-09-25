/**
 * Adresse IP du client, telle que l'application la trace (journal d'audit,
 * signatures, anti force brute).
 *
 * Une seule règle : l'adresse que voit le limiteur de débit, `req.ip`.
 * Express la calcule d'après `trust proxy` : avec un proxy de confiance (le
 * nginx du frontend, qui écrase X-Forwarded-For avec l'adresse réelle du
 * client), il retient la dernière adresse de X-Forwarded-For. Une adresse que
 * le client ajouterait lui-même en tête, ou un X-Real-IP envoyé directement
 * au backend, est ignorée.
 */

/** Nombre de proxys de confiance devant le backend (réglage `trust proxy`
 *  d'Express, posé au démarrage dans main.ts). */
export const TRUSTED_PROXY_HOPS = 1;

/** Ce que clientIp lit de la requête (une `Request` Express convient). */
export interface ClientAddressSource {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
}

/** Adresse IP du client ; à défaut celle de la connexion, puis « unknown ». */
export function clientIp(req: ClientAddressSource): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
