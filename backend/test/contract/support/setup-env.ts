/**
 * Environnement de chaque fichier de contrat (setupFiles de Vitest), posé AVANT
 * l'import de l'application :
 *  - DATABASE_URL pointe sur la base jetable (jamais sur backend/.env) ;
 *  - des secrets propres aux tests, jamais ceux du poste ni de la production ;
 *  - le répertoire de travail temporaire créé par global-setup.ts :
 *    l'application écrit ses fichiers (signatures, pièces jointes, logos)
 *    sous `process.cwd()/data`, calculé à l'import de certains modules. Sans
 *    ce changement de dossier, les tests écriraient dans backend/data, qui
 *    sert au serveur de développement.
 */
import { afterAll, inject } from 'vitest';
import { resolveContractDatabaseUrl } from './database';

process.env.DATABASE_URL = resolveContractDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'contrat-http-secret-jwt-de-test-uniquement-0001';
process.env.ENCRYPTION_KEY = 'contrat-http-cle-de-chiffrement-de-test-0002';
process.env.FRONTEND_URL = 'http://localhost:5173';

const originalCwd = process.cwd();
process.chdir(inject('contractWorkDir'));

afterAll(() => {
  process.chdir(originalCwd);
});
