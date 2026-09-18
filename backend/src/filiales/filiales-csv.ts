import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { escapeCsvCell } from '../common/bon-predicates';

/** En-tête exact partagé par l'export (GET /filiales/export) et le modèle
 *  (GET /filiales/import/template) — le contrat POST /filiales/import lit
 *  ces mêmes noms de colonnes côté frontend. */
export const FILIALES_CSV_HEADERS = [
  'nom', 'nom_affiche', 'adresse', 'siret', 'active', 'logo_base64', 'cachet_base64',
];

/** Forme minimale attendue par buildFilialesExportCsv — un sous-ensemble du
 *  modèle Prisma Filiale. */
export interface FilialeExportRow {
  name: string;
  displayName: string;
  address: string | null;
  siret: string | null;
  active: boolean;
  logoPath: string | null;
  stampPath: string | null;
}

/** Lit un fichier référencé (logoPath/stampPath, relatif à data/) et
 *  l'encode en base64 SANS préfixe de type — le type se déduit de
 *  l'extension déjà stockée dans le chemin. Chaîne vide si le champ est
 *  absent ou si le fichier n'est plus sur le disque (jamais d'exception :
 *  un export doit rester utilisable même avec un fichier manquant). */
function readUploadAsBase64(relativePath: string | null): string {
  if (!relativePath) return '';
  const fullPath = join(process.cwd(), 'data', relativePath);
  if (!existsSync(fullPath)) return '';
  try {
    return readFileSync(fullPath).toString('base64');
  } catch {
    return '';
  }
}

/**
 * Construit le CSV d'export des filiales (BOM UTF-8 inclus, séparateur `;`,
 * cellules échappées via escapeCsvCell — protection contre l'injection de
 * formule Excel/LibreOffice). Fonction pure.
 *
 * Les colonnes image ne sont remplies que si `includeImages` est vrai (export
 * `?images=1`) : sans cela, elles restent vides pour un export « léger »
 * lisible dans un tableur.
 */
export function buildFilialesExportCsv(filiales: FilialeExportRow[], includeImages: boolean): string {
  const rows = filiales.map((f) =>
    [
      f.name,
      f.displayName,
      f.address ?? '',
      f.siret ?? '',
      f.active ? 'oui' : 'non',
      includeImages ? readUploadAsBase64(f.logoPath) : '',
      includeImages ? readUploadAsBase64(f.stampPath) : '',
    ].map(escapeCsvCell),
  );

  const csv = [FILIALES_CSV_HEADERS.map(escapeCsvCell).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  // BOM UTF-8 (U+FEFF) pour Excel — via fromCharCode pour éviter tout
  // caractère littéral invisible dans le source (cf. inventory.service.ts).
  return String.fromCharCode(0xfeff) + csv;
}

/**
 * Construit le CSV « modèle » (GET /filiales/import/template) : même
 * en-tête que l'export, plus deux lignes d'exemple explicitement commentées
 * (préfixées `#`) pour qu'un administrateur sache quoi remplir sans
 * documentation — une filiale complète (adresse + SIRET) et une filiale
 * minimale (seul le nom est obligatoire, le reste peut rester vide).
 */
export function buildFilialesImportTemplateCsv(): string {
  const exampleRows: string[][] = [
    [
      '# Exemple 1 — filiale complète, à remplacer par vos valeurs',
      'Filiale Paris',
      '12 rue de Paris, 75001 Paris',
      '12345678900012',
      'oui',
      '',
      '',
    ],
    [
      '# Exemple 2 — minimal (seul le nom est obligatoire, le reste peut rester vide)',
      '',
      '',
      '',
      'oui',
      '',
      '',
    ],
  ];

  const csv = [
    FILIALES_CSV_HEADERS.map(escapeCsvCell).join(';'),
    ...exampleRows.map((row) => row.map(escapeCsvCell).join(';')),
  ].join('\n');
  return String.fromCharCode(0xfeff) + csv;
}
