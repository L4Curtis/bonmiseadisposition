import type { Response } from 'express';
import { todayInParis } from '../dates/paris';
import { buildCsv, type CsvTable } from './csv';

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** En-tête posé quand l'export a atteint son plafond de lignes. */
export const TRUNCATED_HEADER = 'X-Truncated';

/** En-têtes que le navigateur doit pouvoir lire (nom du fichier, troncature). */
const EXPOSED_HEADERS = `Content-Disposition, ${TRUNCATED_HEADER}`;

/** Caractères admis dans un nom de fichier : tout autre caractère (guillemet,
 *  retour à la ligne, accent…) casserait l'en-tête Content-Disposition. */
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]/g;

/** Nom du fichier téléchargé : « <base>-AAAA-MM-JJ.csv », daté du jour à
 *  Paris (et non en UTC : un export lancé à 0 h 30 porte la date du jour).
 *  `dated: false` pour un nom fixe, comme un modèle d'import. */
export function csvFilename(base: string, options: { dated?: boolean; now?: Date } = {}): string {
  const safeBase = base.replace(UNSAFE_FILENAME_CHARS, '-') || 'export';
  const suffix = options.dated === false ? '' : `-${todayInParis(options.now)}`;
  return `${safeBase}${suffix}.csv`;
}

interface SendCsvCommon {
  /** Nom de base, sans date ni extension (ex. « bons-export »). */
  filename: string;
  /** Vrai si l'export a été coupé à son plafond de lignes. */
  truncated?: boolean;
  /** Faux pour un nom de fichier sans date (modèle d'import). */
  dated?: boolean;
}

/** Contenu à envoyer : les lignes à assembler, ou un fichier déjà assemblé
 *  par `buildCsv`. */
export type SendCsvOptions = SendCsvCommon & ({ rows: CsvTable; csv?: never } | { csv: string; rows?: never });

/**
 * Envoie un export CSV en téléchargement :
 * - `Content-Type` CSV en UTF-8 ;
 * - `Content-Disposition` avec un nom de fichier daté à Paris ;
 * - `X-Truncated: true` si l'export a été coupé à son plafond ;
 * - `Access-Control-Expose-Headers`, pour que le navigateur puisse lire ces
 *   deux derniers en-têtes et prévenir l'utilisateur.
 */
export function sendCsv(res: Response, options: SendCsvOptions): void {
  const body = options.csv === undefined ? buildCsv(options.rows) : options.csv;
  res.setHeader('Content-Type', CSV_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(options.filename, options)}"`);
  res.append('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  if (options.truncated) {
    res.setHeader(TRUNCATED_HEADER, 'true');
  }
  res.send(body);
}
