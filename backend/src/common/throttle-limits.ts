/**
 * Limites de débit des opérations lourdes, à poser avec `@Throttle(...)` sur
 * la route. La limite globale (60 requêtes par minute, `app.module.ts`) suffit
 * aux lectures ordinaires ; ces opérations, elles, lisent ou écrivent des
 * milliers de lignes, ou interrogent un serveur externe (annuaire) : une
 * rafale de clics ou un script ne doit pas pouvoir les enchaîner.
 *
 * Le compteur est tenu par adresse du client et par route (ThrottlerGuard
 * global), comme la limite générale.
 */
const MINUTE_MS = 60_000;

/** Export CSV volumineux (journal d'audit…) : 10 par minute. */
export const HEAVY_EXPORT_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } } as const;

/** Import d'un fichier (modèles d'email ou PDF…) : 10 par minute. */
export const IMPORT_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } } as const;

/** Traitement de fond lancé à la main (rétention, synchronisation ou
 *  désactivation de l'annuaire) : 5 par minute. */
export const HEAVY_OPERATION_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } } as const;

/** Test de connexion à un serveur externe (SMTP, annuaire, Microsoft, partage
 *  réseau) : 10 par minute. Un test SMTP peut envoyer un vrai email, et chaque
 *  test ouvre une connexion vers un serveur de l'entreprise. */
export const CONNECTION_TEST_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } } as const;
