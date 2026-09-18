/** Élément prêt à être envoyé à POST /filiales/import (voir {@link FilialeImportItem}). */
export interface FilialeImportItem {
  name: string;
  displayName?: string;
  address?: string;
  siret?: string;
  active?: boolean;
  logoBase64?: string;
  stampBase64?: string;
}

export interface ParsedFilialeRow {
  line: number;
  item: FilialeImportItem;
}

export interface FilialeCsvRowError {
  line: number;
  message: string;
}

export interface ParseFilialesCsvResult {
  rows: ParsedFilialeRow[];
  invalidRows: FilialeCsvRowError[];
}

/** Nombre maximal de lignes accepté par POST /filiales/import. */
export const FILIALE_IMPORT_MAX_ROWS = 200;

const EXPECTED_HEADER = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64';

function detectSeparator(headerLine: string): string {
  return headerLine.includes(';') ? ';' : ',';
}

/** Découpe une ligne CSV en respectant les champs entre guillemets doubles
 *  (permet à `adresse` de contenir le séparateur ou des guillemets échappés
 *  `""`, comme le veut la norme CSV). */
function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
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
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Interprète la colonne `active` (oui/non) en booléen. `undefined` si la
 *  cellule est vide (laisse le serveur appliquer son défaut), `null` si la
 *  valeur n'est ni vide, ni oui, ni non (ligne invalide). */
function parseActiveCell(raw: string): boolean | undefined | null {
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  if (value === 'oui') return true;
  if (value === 'non') return false;
  return null;
}

function cellOrUndefined(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  return value === '' ? undefined : value;
}

/** Parse un CSV d'import de filiales (en-tête
 *  `nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64`, séparateur
 *  `;` ou `,`, colonnes dans un ordre quelconque, seule `nom` est obligatoire).
 *  Les lignes invalides sont rapportées avec leur numéro de ligne d'origine
 *  (1-based, en-tête inclus) plutôt que d'interrompre l'import entier. Les
 *  colonnes image (`logo_base64`, `cachet_base64`) sont transmises telles
 *  quelles : c'est le serveur qui les valide. */
export function parseFilialesCsv(text: string): ParseFilialesCsvResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], invalidRows: [{ line: 1, message: 'Fichier vide' }] };
  }

  const separator = detectSeparator(lines[0]);
  const header = splitCsvLine(lines[0], separator).map(normalizeHeaderCell);
  const nameIdx = header.indexOf('nom');
  const displayNameIdx = header.indexOf('nom_affiche');
  const addressIdx = header.indexOf('adresse');
  const siretIdx = header.indexOf('siret');
  const activeIdx = header.indexOf('active');
  const logoIdx = header.indexOf('logo_base64');
  const stampIdx = header.indexOf('cachet_base64');

  if (nameIdx === -1) {
    return {
      rows: [],
      invalidRows: [{ line: 1, message: `En-tête invalide : colonnes attendues ${EXPECTED_HEADER}` }],
    };
  }

  const rows: ParsedFilialeRow[] = [];
  const invalidRows: FilialeCsvRowError[] = [];

  lines.slice(1).forEach((rawLine, idx) => {
    const lineNumber = idx + 2; // +1 pour l'en-tête, +1 pour repasser en 1-based
    const cells = splitCsvLine(rawLine, separator);
    const name = (cells[nameIdx] ?? '').trim();

    // Ligne de commentaire : le modèle téléchargeable préfixe ses exemples
    // d'un dièse. Sans cette règle, importer le modèle tel quel créerait des
    // filiales fantômes nommées « # Exemple 1 — … ».
    if (name.startsWith('#')) return;

    if (!name) {
      invalidRows.push({ line: lineNumber, message: 'Nom obligatoire' });
      return;
    }

    const active = activeIdx === -1 ? undefined : parseActiveCell(cells[activeIdx] ?? '');
    if (active === null) {
      invalidRows.push({ line: lineNumber, message: 'Valeur « active » invalide (oui/non attendu)' });
      return;
    }

    rows.push({
      line: lineNumber,
      item: {
        name,
        displayName: displayNameIdx === -1 ? undefined : cellOrUndefined(cells[displayNameIdx]),
        address: addressIdx === -1 ? undefined : cellOrUndefined(cells[addressIdx]),
        siret: siretIdx === -1 ? undefined : cellOrUndefined(cells[siretIdx]),
        active,
        logoBase64: logoIdx === -1 ? undefined : cellOrUndefined(cells[logoIdx]),
        stampBase64: stampIdx === -1 ? undefined : cellOrUndefined(cells[stampIdx]),
      },
    });
  });

  return { rows, invalidRows };
}

/** Lit le contenu texte d'un fichier sélectionné par l'utilisateur. Utilise
 *  `FileReader` plutôt que `File.prototype.text()` : cette dernière n'est pas
 *  implémentée par jsdom (environnement de test), alors que `FileReader` est
 *  supporté partout, y compris dans les tests. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

/** Déclenche le téléchargement d'un fichier reçu du serveur (export ou modèle
 *  d'import) : contrairement au catalogue, l'export des filiales est généré
 *  côté serveur (il inclut potentiellement les images encodées en base64), le
 *  navigateur se contente donc de relayer le `Blob` reçu — aucun contenu CSV
 *  n'est produit ici, donc aucun échappement anti-injection de formule n'est
 *  nécessaire dans ce module. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
