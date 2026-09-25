import { CATEGORIES } from '../types';
import { saveBlob } from '@/lib/download';

const UTF8_BOM = '\uFEFF';

export interface ImportCsvItem {
  category: string;
  brand: string;
  model: string;
  description: string;
}

export interface ParsedCsvRow {
  line: number;
  item: ImportCsvItem;
}

export interface CsvRowError {
  line: number;
  message: string;
}

export interface ParseCatalogCsvResult {
  rows: ParsedCsvRow[];
  invalidRows: CsvRowError[];
}

const EXPECTED_COLUMNS = ['categorie', 'marque', 'modele', 'description'];

/** Nombre maximal de lignes acceptées par POST /equipment/catalog/import. */
export const CSV_IMPORT_MAX_ROWS = 500;

function detectSeparator(headerLine: string): string {
  return headerLine.includes(';') ? ';' : ',';
}

/** Découpe une ligne CSV en respectant les champs entre guillemets doubles
 *  (permet à `description` de contenir le séparateur ou des guillemets
 *  échappés `""`, comme le veut la norme CSV). */
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
      // Un guillemet n'ouvre un champ cité que s'il est le tout premier
      // caractère du champ (RFC 4180) — un guillemet ailleurs (ex. 27" pour
      // « pouces ») est un caractère littéral, pas un délimiteur.
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

/** Parse un CSV catalogue (en-tête `categorie;marque;modele;description`,
 *  séparateur `;` ou `,`, colonnes dans un ordre quelconque) et valide chaque
 *  ligne : catégorie connue (clé d'enum), marque et modèle non vides. Les
 *  lignes invalides sont rapportées avec leur numéro de ligne (1-based,
 *  en-tête inclus) plutôt que d'interrompre l'import entier. */
export function parseCatalogCsv(text: string): ParseCatalogCsvResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], invalidRows: [{ line: 1, message: 'Fichier vide' }] };
  }

  const separator = detectSeparator(lines[0]);
  const header = splitCsvLine(lines[0], separator).map(normalizeHeaderCell);
  const categoryIdx = header.indexOf('categorie');
  const brandIdx = header.indexOf('marque');
  const modelIdx = header.indexOf('modele');
  const descriptionIdx = header.indexOf('description');

  if (categoryIdx === -1 || brandIdx === -1 || modelIdx === -1) {
    return {
      rows: [],
      invalidRows: [{
        line: 1,
        message: 'En-tête invalide : colonnes attendues categorie;marque;modele;description',
      }],
    };
  }

  const knownCategories = new Set(Object.keys(CATEGORIES));
  const rows: ParsedCsvRow[] = [];
  const invalidRows: CsvRowError[] = [];

  lines.slice(1).forEach((rawLine, idx) => {
    const lineNumber = idx + 2; // +1 pour l'en-tête, +1 pour repasser en 1-based
    const cells = splitCsvLine(rawLine, separator);
    const categoryRaw = (cells[categoryIdx] ?? '').trim();
    const category = categoryRaw.toLowerCase();
    const brand = (cells[brandIdx] ?? '').trim();
    const model = (cells[modelIdx] ?? '').trim();
    const description = descriptionIdx === -1 ? '' : (cells[descriptionIdx] ?? '').trim();

    if (!knownCategories.has(category)) {
      invalidRows.push({ line: lineNumber, message: `Catégorie inconnue : « ${categoryRaw || '(vide)'} »` });
      return;
    }
    if (!brand || !model) {
      invalidRows.push({ line: lineNumber, message: 'Marque et modèle obligatoires' });
      return;
    }
    rows.push({ line: lineNumber, item: { category, brand, model, description } });
  });

  return { rows, invalidRows };
}

/** Échappe une cellule CSV — reproduit fidèlement `escapeCsvCell` du backend
 *  (`backend/src/common/bon-predicates.ts`) : chaque cellule est systéma-
 *  tiquement entre guillemets (guillemets internes doublés), et toute valeur
 *  commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est
 *  préfixée d'une apostrophe — protection contre l'injection de formule à
 *  l'ouverture du fichier dans Excel/LibreOffice. */
export function escapeCsvCell(value: string): string {
  let s = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s}"`;
}

/** Génère le CSV du catalogue affiché, mêmes colonnes que l'import,
 *  séparateur `;` (convention Excel FR). */
export function buildCatalogCsv(
  items: { category: string; brand: string; model: string; description?: string }[],
): string {
  const header = EXPECTED_COLUMNS.map(escapeCsvCell).join(';');
  const lines = items.map((item) => [item.category, item.brand, item.model, item.description ?? '']
    .map(escapeCsvCell)
    .join(';'));
  return [header, ...lines].join('\r\n');
}

/** Un équipement d'exemple par catégorie autorisée, pour le modèle CSV
 *  téléchargeable : la personne qui importe découvre ainsi les valeurs
 *  acceptées pour `categorie` sans avoir besoin de documentation externe. */
const TEMPLATE_EXAMPLES: Record<string, { brand: string; model: string; description: string }> = {
  pc_portable: { brand: 'Lenovo', model: 'ThinkPad T14', description: 'Ordinateur portable standard' },
  pc_fixe: { brand: 'HP', model: 'EliteDesk 800', description: 'Poste fixe de bureau' },
  ecran: { brand: 'Dell', model: 'P2422H', description: 'Écran 24 pouces' },
  souris: { brand: 'Logitech', model: 'MX Master 3', description: 'Souris sans fil' },
  clavier: { brand: 'Logitech', model: 'K120', description: 'Clavier filaire' },
  casque: { brand: 'Jabra', model: 'Evolve2 40', description: 'Casque avec micro' },
  telephone: { brand: 'Apple', model: 'iPhone SE', description: 'Téléphone professionnel' },
  housse: { brand: 'Targus', model: 'Housse 15 pouces', description: 'Housse de protection' },
  dock: { brand: 'Dell', model: 'WD19', description: "Station d'accueil USB-C" },
  cable: { brand: 'Générique', model: 'Câble USB-C 1m', description: 'Câble de charge/données' },
  autre: { brand: 'Divers', model: 'Article non catégorisé', description: 'À adapter selon le besoin' },
};

/** Génère un CSV modèle : en-tête + une ligne d'exemple par catégorie
 *  autorisée (voir {@link TEMPLATE_EXAMPLES}), pour que l'import ne nécessite
 *  aucune documentation externe. */
export function buildCatalogTemplateCsv(): string {
  const header = EXPECTED_COLUMNS.map(escapeCsvCell).join(';');
  const lines = Object.keys(CATEGORIES).map((category) => {
    const example = TEMPLATE_EXAMPLES[category] ?? { brand: 'Marque', model: 'Modèle', description: '' };
    return [category, example.brand, example.model, example.description].map(escapeCsvCell).join(';');
  });
  return [header, ...lines].join('\r\n');
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

/** Déclenche le téléchargement d'un fichier CSV côté navigateur. Le BOM UTF-8
 *  garantit qu'Excel FR détecte l'encodage et affiche correctement les accents. */
export function downloadCsv(filename: string, content: string): void {
  saveBlob(new Blob([UTF8_BOM, content], { type: 'text/csv;charset=utf-8;' }), filename);
}
