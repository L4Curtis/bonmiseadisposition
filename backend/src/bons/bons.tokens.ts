/**
 * Jeton d'injection de BonsService.
 *
 * SignatureService a besoin de BonsService (hook PV de clôture après une
 * signature de restitution) alors que BonsService dépend déjà de
 * SignatureService. Importer la CLASSE BonsService depuis signature.service.ts
 * formerait un cycle de fichiers CommonJS : selon l'ordre de chargement en
 * production, SignatureService vaut `undefined` au moment où le décorateur de
 * BonsService enregistre ses paramètres → « Nest can't resolve dependencies of
 * the BonsService (PrismaService, ?, …) » au démarrage.
 *
 * Ce fichier n'importe rien : signature.service.ts peut l'utiliser avec un
 * `import type { BonsService }` (effacé à la compilation) et résoudre le
 * service via ModuleRef.get(BONS_SERVICE, { strict: false }).
 * Voir src/__tests__/import-order.spec.ts.
 */
export const BONS_SERVICE = 'BONS_SERVICE';
