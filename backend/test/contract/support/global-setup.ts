/**
 * Préparation unique de la suite de contrat (globalSetup de Vitest) :
 *  - applique les migrations du dépôt sur la base jetable, exactement comme la
 *    production au démarrage du conteneur (`prisma migrate deploy`) ; Prisma
 *    crée la base si elle n'existe pas encore ;
 *  - crée le répertoire de travail temporaire où l'application écrit ses
 *    fichiers pendant les tests (voir setup-env.ts), supprimé à la fin.
 * Le jeu de données, lui, est recréé par chaque fichier de test (seed.ts),
 * pour que les fichiers restent indépendants les uns des autres.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import { resolveContractDatabaseUrl } from './database';

declare module 'vitest' {
  export interface ProvidedContext {
    contractWorkDir: string;
  }
}

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');

function applyMigrations(databaseUrl: string): void {
  // Le CLI Prisma est appelé par son point d'entrée JavaScript plutôt que par
  // `npx` : pas de shell, donc le même appel sous Windows et sous Linux.
  const prismaCli = createRequire(resolve(BACKEND_ROOT, 'package.json')).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

export default function setup(project: TestProject): () => void {
  applyMigrations(resolveContractDatabaseUrl());
  const workDir = mkdtempSync(join(tmpdir(), 'bmad-contract-'));
  project.provide('contractWorkDir', workDir);
  return () => rmSync(workDir, { recursive: true, force: true, maxRetries: 3 });
}
