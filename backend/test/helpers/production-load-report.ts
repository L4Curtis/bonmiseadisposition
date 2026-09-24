import { execFileSync } from 'child_process';
import * as path from 'path';

/** Métadonnées de constructeur d'un export, telles que vues en production. */
export interface ParamTypesReport {
  paramCount: number;
  undefinedIndexes: number[];
}

/** fichier → nom d'export → métadonnées (voir production-load-report.cjs). */
export type ProductionLoadReport = Record<string, Record<string, ParamTypesReport>>;

const SCRIPT = path.join(__dirname, 'production-load-report.cjs');

/**
 * Charge `files` dans cet ordre, dans un processus Node neuf, avec la même
 * chaîne que la production (TypeScript → CommonJS → require de Node), et
 * rend compte des métadonnées `design:paramtypes` de chaque export.
 * Une erreur de chargement fait échouer l'appel (et donc le test) avec la
 * sortie d'erreur du processus enfant.
 */
export function loadLikeProduction(files: readonly string[]): ProductionLoadReport {
  const output = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(files),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(output) as ProductionLoadReport;
}
