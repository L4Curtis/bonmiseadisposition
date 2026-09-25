/**
 * Fabrication des fichiers CSV exportés (bons, inventaire, journal d'audit,
 * historique d'un équipement, filiales, utilisateurs).
 *
 * Format commun, pensé pour Excel en français :
 * - BOM UTF-8 en tête, sans quoi Excel lit les accents de travers ;
 * - séparateur « ; » (la virgule sert de séparateur décimal) ;
 * - chaque cellule entre guillemets, lignes séparées par « \n ».
 */

/** Marque d'ordre des octets UTF-8 (U+FEFF), écrite par son code pour ne
 *  laisser aucun caractère invisible dans le source. */
export const CSV_BOM = String.fromCharCode(0xfeff);

export const CSV_SEPARATOR = ';';

/** Contenu d'une cellule. Un nombre est écrit tel quel, une valeur absente
 *  donne une cellule vide. */
export type CsvCell = string | number | null | undefined;

/** Fichier CSV avant assemblage : noms de colonnes puis lignes. */
export interface CsvTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly CsvCell[])[];
}

/** Premiers caractères qui font d'une cellule une formule dans Excel ou
 *  LibreOffice (`=`, `+`, `-`, `@`, tabulation, retour chariot). */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Échappe une cellule : double les guillemets internes et neutralise
 * l'injection de formule en préfixant d'une apostrophe une cellule qui
 * commencerait par un caractère déclencheur. Un nombre négatif est donc
 * écrit « '-3 » : la sécurité passe avant la mise en forme.
 */
export function escapeCsvCell(value: CsvCell): string {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${FORMULA_TRIGGER.test(text) ? `'${text}` : text}"`;
}

/** Une ligne : cellules échappées, séparées par « ; ». */
export function csvLine(cells: readonly CsvCell[]): string {
  return cells.map(escapeCsvCell).join(CSV_SEPARATOR);
}

/** Assemble le fichier complet : BOM, en-tête, puis une ligne par enregistrement. */
export function buildCsv(table: CsvTable): string {
  return CSV_BOM + [table.header, ...table.rows].map(csvLine).join('\n');
}
