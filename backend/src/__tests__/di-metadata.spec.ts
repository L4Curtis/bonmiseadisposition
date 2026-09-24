/**
 * Garde générique contre les cycles d'import CommonJS.
 *
 * Charge app.module en premier (même ordre qu'en production), puis chaque
 * fichier service / controller / guard / strategy / filter / middleware, et
 * vérifie qu'aucune classe injectable n'a de paramètre de constructeur
 * `undefined` dans ses métadonnées `design:paramtypes`. Un `undefined` ici
 * signifie qu'une classe importée valait `undefined` au moment de la
 * décoration (require circulaire) et que Nest échouera au démarrage avec
 * « Nest can't resolve dependencies of X (…, ?, …) ».
 *
 * Le chargement a lieu dans un processus Node neuf, avec la chaîne de
 * compilation de la production (TypeScript → CommonJS → require de Node) :
 * voir test/helpers/production-load-report.cjs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadLikeProduction } from '../../test/helpers/production-load-report';

const SRC = path.resolve(__dirname, '..');
// Transpiler et charger toute l'application dans un processus neuf prend
// plusieurs dizaines de secondes sur un poste Windows chargé (bien moins sous
// Linux) : délai propre à ce test, au-delà du délai global de la suite.
const FULL_LOAD_TIMEOUT_MS = 180_000;
const FILE_RE = /\.(service|controller|guard|strategy|filter|middleware|interceptor)\.ts$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('DI metadata after loading app.module first (production import order)', () => {
  it('no injectable class has an undefined constructor parameter', () => {
    const files = walk(SRC);
    // Garde-fou du garde-fou : un parcours vide rendrait le test vert sans rien vérifier.
    expect(files.length).toBeGreaterThan(20);

    const report = loadLikeProduction([path.join(SRC, 'app.module.ts'), ...files]);

    // Et si les métadonnées n'étaient pas émises, aucun `undefined` ne serait
    // jamais vu : on exige qu'un bon nombre de classes en portent.
    const classesWithMetadata = files.flatMap((file) => Object.keys(report[file] ?? {}));
    expect(classesWithMetadata.length).toBeGreaterThan(20);

    const problems: string[] = [];
    for (const file of files) {
      for (const [name, { undefinedIndexes }] of Object.entries(report[file] ?? {})) {
        for (const i of undefinedIndexes) {
          problems.push(`${path.relative(SRC, file)} → ${name} : paramètre #${i} undefined`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, FULL_LOAD_TIMEOUT_MS);
});
