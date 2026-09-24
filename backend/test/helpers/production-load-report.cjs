/**
 * Charge des fichiers source du backend EXACTEMENT comme la production les
 * charge, puis rend compte de leurs métadonnées de constructeur.
 *
 * Utilisé par src/__tests__/di-metadata.spec.ts et import-order.spec.ts, qui
 * protègent contre un cycle d'import CommonJS ayant déjà cassé la production
 * (« Nest can't resolve dependencies of X (…, ?, …) »). Ce défaut n'existe que
 * dans le code tel que le produit `nest build` : du CommonJS émis par le
 * compilateur TypeScript, exécuté par le require() de Node, où un require
 * circulaire rend un export `undefined` au moment où un décorateur enregistre
 * les types de paramètres. Vitest exécute les tests en ESM avec son propre
 * transformeur (SWC) : il ne reproduirait pas fidèlement ce mécanisme. D'où ce
 * script, lancé dans un processus Node séparé par les deux specs :
 *   - chaque fichier .ts est compilé par TypeScript au sein du programme
 *     complet de tsconfig.build.json (module commonjs, emitDecoratorMetadata…),
 *     comme par `nest build` ;
 *   - le chargement passe par le require() de Node (paquets @nestjs compris,
 *     via le require(esm) de Node 22, comme en production) ;
 *   - le processus est neuf : registre de modules vierge, l'ordre de
 *     chargement demandé est donc bien celui qui s'applique.
 *
 * Entrée (stdin) : tableau JSON de chemins absolus, chargés dans cet ordre.
 * Sortie (stdout) : pour chaque fichier, chaque export de type fonction
 * portant des métadonnées `design:paramtypes` →
 *   { "paramCount": n, "undefinedIndexes": [i, …] }.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Programme TypeScript complet, construit comme celui de `nest build`
 * (tsconfig.build.json). Une transpilation fichier par fichier
 * (ts.transpileModule, isolatedModules) ne convient PAS : faute de savoir si
 * un nom importé est une classe ou un simple type, elle émet pour les
 * métadonnées `typeof X === "undefined" ? Object : X`, ce qui remplace
 * l'`undefined` d'un cycle par `Object` et rendrait ce garde-fou aveugle.
 * Avec le programme complet, TypeScript émet la référence directe à la classe,
 * exactement comme dans dist/.
 */
function createProgram() {
  const configPath = path.join(BACKEND_ROOT, 'tsconfig.build.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, BACKEND_ROOT);
  // Options sans effet sur le JavaScript émis, inutiles ici.
  const options = { ...parsed.options, incremental: false, declaration: false, sourceMap: false, noEmit: false };
  return ts.createProgram({ rootNames: parsed.fileNames, options });
}

function registerTypeScriptLoader(program) {
  Module._extensions['.ts'] = function loadTypeScript(module, filename) {
    const sourceFile = program.getSourceFile(filename);
    if (!sourceFile) {
      throw new Error(`Fichier absent du programme de tsconfig.build.json : ${filename}`);
    }
    let outputText;
    program.emit(sourceFile, (name, text) => {
      if (name.endsWith('.js')) outputText = text;
    });
    if (outputText === undefined) {
      throw new Error(`TypeScript n'a rien émis pour ${filename}`);
    }
    module._compile(outputText, filename);
  };
}

function reportFor(exportsOfFile) {
  const report = {};
  for (const [name, exported] of Object.entries(exportsOfFile)) {
    if (typeof exported !== 'function') continue;
    const params = Reflect.getMetadata('design:paramtypes', exported);
    if (!params) continue;
    report[name] = {
      paramCount: params.length,
      undefinedIndexes: params.map((p, i) => (p === undefined ? i : -1)).filter((i) => i >= 0),
    };
  }
  return report;
}

function main() {
  const files = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string' || !path.isAbsolute(f))) {
    throw new Error('Entrée attendue : tableau JSON de chemins absolus.');
  }
  require('reflect-metadata');
  registerTypeScriptLoader(createProgram());
  const result = {};
  for (const file of files) {
    result[file] = reportFor(require(file));
  }
  process.stdout.write(JSON.stringify(result));
}

main();
