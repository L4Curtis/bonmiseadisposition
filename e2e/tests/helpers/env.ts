/** Constantes d'environnement E2E — valeurs par défaut alignées sur
 *  `e2e/docker-compose.e2e.yml` ; surchageables via variables d'environnement
 *  pour lancer les tests contre une autre instance (ex. port déjà pris). */

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8081';
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8026';

export const ADMIN_EMAIL = 'admin@local';
/** Doit rester synchronisé avec DEFAULT_ADMIN_PASSWORD dans docker-compose.e2e.yml. */
export const ADMIN_INITIAL_PASSWORD = process.env.E2E_ADMIN_INITIAL_PASSWORD ?? 'E2eInitial#2026';
/** Nouveau mot de passe choisi par le test de connexion (écran de changement
 *  obligatoire) — réutilisé par tous les autres tests via le storageState. */
export const ADMIN_NEW_PASSWORD = process.env.E2E_ADMIN_NEW_PASSWORD ?? 'E2eNouveauMdp#2026';

/** Session admin authentifiée, enregistrée une fois par le projet "setup"
 *  (tests/auth.setup.ts) et réutilisée par tous les autres tests. */
export const STORAGE_STATE_PATH = 'playwright/.auth/admin.json';

/** Article de catalogue unique fourni par l'amorçage (e2e/seed/seed.sql). */
export const CATALOG_QUERY = 'E2E';
export const CATALOG_ITEM_LABEL = 'E2E Materiel Test';
export const FILIALE_NAME = 'E2E Test';
