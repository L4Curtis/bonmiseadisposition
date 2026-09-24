/** Élément prêt à être envoyé à POST /users/manual/import. Une propriété
 *  absente signifie « cellule vide » : à la mise à jour, le champ n'est pas
 *  modifié. */
export interface ManualUserImportItem {
  samAccountName?: string;
  firstName: string;
  lastName: string;
  email?: string;
  department?: string;
  filiale?: string;
  active?: boolean;
}

export interface ParsedManualUserRow {
  /** Numéro de ligne dans le fichier d'origine (1-based, en-tête inclus). */
  line: number;
  item: ManualUserImportItem;
}

export interface ManualUserCsvRowError {
  line: number;
  message: string;
}

export interface ParseManualUsersCsvResult {
  rows: ParsedManualUserRow[];
  invalidRows: ManualUserCsvRowError[];
}

/** Nombre maximal de lignes accepté par POST /users/manual/import. */
export const MANUAL_USERS_IMPORT_MAX_ROWS = 500;

export const MANUAL_USERS_EXPECTED_HEADER = 'identifiant;prenom;nom;email;service;filiale;actif';

// Contrôle de forme volontairement simple : le serveur reste seul juge
// (class-validator @IsEmail) — ici on évite seulement d'envoyer une valeur
// manifestement fausse sans que l'aperçu le signale.
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function detectSeparator(headerLine: string): string {
  return headerLine.includes(';') ? ';' : ',';
}

/** Découpe une ligne CSV en respectant les champs entre guillemets doubles
 *  et les guillemets échappés `""` — même règle que filiales/lib/csv.ts. */
function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"' && current === '') {
      inQuotes = true;
    } else if (char === separator) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function normalizeHeaderCell(cell: string): string {
  return cell
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Clé de doublon « même personne » : accents, casse et ponctuation ignorés
 *  (même normalisation que l'identifiant généré côté serveur). */
function personKey(firstName: string, lastName: string): string {
  const slug = (value: string): string => value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug(firstName)}.${slug(lastName)}`;
}

/** `undefined` si vide, booléen si oui/non, `null` si valeur inconnue. */
function parseActiveCell(raw: string): boolean | undefined | null {
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  if (value === 'oui') return true;
  if (value === 'non') return false;
  return null;
}

function cellOrUndefined(cells: string[], index: number): string | undefined {
  if (index === -1) return undefined;
  const value = (cells[index] ?? '').trim();
  return value === '' ? undefined : value;
}

interface ColumnIndexes {
  sam: number; first: number; last: number; email: number; department: number; filiale: number; active: number;
}

function readColumns(header: string[]): ColumnIndexes {
  return {
    sam: header.indexOf('identifiant'),
    first: header.indexOf('prenom'),
    last: header.indexOf('nom'),
    email: header.indexOf('email'),
    department: header.indexOf('service'),
    filiale: header.indexOf('filiale'),
    active: header.indexOf('actif'),
  };
}

/** Transforme une ligne de données en élément, ou en message d'erreur. */
function parseRow(cells: string[], cols: ColumnIndexes): ManualUserImportItem | string {
  const firstName = cellOrUndefined(cells, cols.first);
  const lastName = cellOrUndefined(cells, cols.last);
  if (!firstName || !lastName) return 'Prénom et nom obligatoires';

  const email = cellOrUndefined(cells, cols.email);
  if (email && !EMAIL_SHAPE_RE.test(email)) return `Email invalide (${email})`;

  const active = cols.active === -1 ? undefined : parseActiveCell(cells[cols.active] ?? '');
  if (active === null) return 'Valeur « actif » invalide (oui/non attendu)';

  return {
    samAccountName: cellOrUndefined(cells, cols.sam),
    firstName,
    lastName,
    email,
    department: cellOrUndefined(cells, cols.department),
    filiale: cellOrUndefined(cells, cols.filiale),
    active,
  };
}

/** Détecte un doublon à l'intérieur du fichier (même identifiant, même email,
 *  ou même prénom/nom pour une création) ; renvoie le message ou `null`. */
function duplicateOf(item: ManualUserImportItem, seen: Map<string, number>): string | null {
  const keys = [
    item.samAccountName ? [`sam:${item.samAccountName.toLowerCase()}`, 'même identifiant'] : null,
    item.email ? [`email:${item.email.toLowerCase()}`, 'même email'] : null,
    item.samAccountName ? null : [`nom:${personKey(item.firstName, item.lastName)}`, 'même prénom et nom'],
  ].filter((k): k is string[] => k !== null);
  const hit = keys.find(([key]) => seen.has(key));
  return hit ? `Doublon de la ligne ${seen.get(hit[0])} (${hit[1]})` : null;
}

/** Parse un CSV d'import de collaborateurs créés à la main (en-tête
 *  `identifiant;prenom;nom;email;service;filiale;actif`, séparateur `;` ou
 *  `,`, colonnes dans un ordre quelconque, `prenom` et `nom` obligatoires).
 *  Les lignes `#` (commentaires du modèle) sont ignorées ; les lignes
 *  invalides et les doublons internes au fichier sont rapportés avec leur
 *  numéro de ligne et ne sont pas envoyés. */
export function parseManualUsersCsv(text: string): ParseManualUsersCsvResult {
  const allLines = text.split(/\r\n|\r|\n/);
  const firstIdx = allLines.findIndex((line) => line.trim().length > 0);
  if (firstIdx === -1) {
    return { rows: [], invalidRows: [{ line: 1, message: 'Fichier vide' }] };
  }

  const separator = detectSeparator(allLines[firstIdx]);
  const cols = readColumns(splitCsvLine(allLines[firstIdx], separator).map(normalizeHeaderCell));
  if (cols.first === -1 || cols.last === -1) {
    return {
      rows: [],
      invalidRows: [{ line: firstIdx + 1, message: `En-tête invalide : colonnes attendues ${MANUAL_USERS_EXPECTED_HEADER}` }],
    };
  }

  const rows: ParsedManualUserRow[] = [];
  const invalidRows: ManualUserCsvRowError[] = [];
  const seen = new Map<string, number>();

  allLines.forEach((rawLine, idx) => {
    if (idx <= firstIdx || rawLine.trim().length === 0) return;
    const line = idx + 1;
    const cells = splitCsvLine(rawLine, separator);
    // Ligne de commentaire du modèle (rappel des valeurs, exemple).
    const leading = [cells[0], cells[cols.first], cols.sam === -1 ? '' : cells[cols.sam]];
    if (leading.some((cell) => (cell ?? '').startsWith('#'))) return;

    const parsed = parseRow(cells, cols);
    if (typeof parsed === 'string') {
      invalidRows.push({ line, message: parsed });
      return;
    }
    const duplicate = duplicateOf(parsed, seen);
    if (duplicate) {
      invalidRows.push({ line, message: duplicate });
      return;
    }
    if (parsed.samAccountName) seen.set(`sam:${parsed.samAccountName.toLowerCase()}`, line);
    if (parsed.email) seen.set(`email:${parsed.email.toLowerCase()}`, line);
    if (!parsed.samAccountName) seen.set(`nom:${personKey(parsed.firstName, parsed.lastName)}`, line);
    rows.push({ line, item: parsed });
  });

  return { rows, invalidRows };
}
