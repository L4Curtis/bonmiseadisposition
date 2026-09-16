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
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
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
    const problems: string[] = [];
    jest.isolateModules(() => {
      require('../app.module');
      for (const file of walk(SRC)) {
        const mod = require(file) as Record<string, unknown>;
        for (const [name, exported] of Object.entries(mod)) {
          if (typeof exported !== 'function') continue;
          const params: unknown[] | undefined = Reflect.getMetadata('design:paramtypes', exported);
          if (!params) continue;
          params.forEach((p, i) => {
            if (p === undefined) {
              problems.push(`${path.relative(SRC, file)} → ${name} : paramètre #${i} undefined`);
            }
          });
        }
      }
    });
    expect(problems).toEqual([]);
  });
});
