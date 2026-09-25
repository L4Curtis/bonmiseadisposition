#!/usr/bin/env node
/**
 * Recopie les contrats de l'API (backend/src/contracts/*.ts) dans
 * frontend/src/contracts/, pour que le front importe exactement les types que
 * les tests de contrat HTTP vérifient sur l'application réelle.
 *
 * Usage (depuis backend/) : `npm run sync-contracts`
 *
 * - Chaque copie reçoit un en-tête « fichier généré, ne pas modifier ».
 * - Un fichier supprimé côté backend est supprimé côté frontend.
 * - Fins de ligne normalisées en LF : la sortie est identique sous Windows et
 *   sous Linux, ce qui permet à la CI de comparer la copie versionnée à une
 *   copie fraîche (étape « Contrats partagés à jour » de docker.yml).
 *
 * Le front ne doit JAMAIS modifier ces copies : on modifie la source dans
 * backend/src/contracts/, on relance le script, on versionne les deux.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(BACKEND_ROOT, 'src', 'contracts');
const TARGET_DIR = resolve(BACKEND_ROOT, '..', 'frontend', 'src', 'contracts');

function header(fileName) {
  return [
    '// ─────────────────────────────────────────────────────────────────────────────',
    '// FICHIER GÉNÉRÉ — NE PAS MODIFIER.',
    `// Source : backend/src/contracts/${fileName}`,
    '// Pour changer ce contrat : modifier la source, puis lancer',
    '// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.',
    '// ─────────────────────────────────────────────────────────────────────────────',
    '',
    '',
  ].join('\n');
}

function contractFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort();
}

function sync() {
  const sources = contractFiles(SOURCE_DIR);
  if (sources.length === 0) {
    throw new Error(`Aucun contrat trouvé dans ${SOURCE_DIR}`);
  }
  mkdirSync(TARGET_DIR, { recursive: true });

  for (const fileName of sources) {
    const content = readFileSync(join(SOURCE_DIR, fileName), 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(join(TARGET_DIR, fileName), header(fileName) + content, 'utf8');
  }

  const stale = contractFiles(TARGET_DIR).filter((fileName) => !sources.includes(fileName));
  for (const fileName of stale) {
    rmSync(join(TARGET_DIR, fileName));
  }

  const removed = stale.length > 0 ? `, ${stale.length} copie(s) obsolète(s) supprimée(s)` : '';
  process.stdout.write(`Contrats recopiés : ${sources.length} fichier(s) vers frontend/src/contracts${removed}.\n`);
}

try {
  sync();
} catch (error) {
  process.stderr.write(`sync-contracts : ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
