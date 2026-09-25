import { buildCsv } from '../common/csv';
import { splitManualDisplayName } from './manual-account.util';
import { IMPORT_MANUAL_USERS_MAX_ITEMS } from './dto/import-users.dto';

/** En-tête exact partagé par l'export (GET /users/manual/export) et le modèle
 *  (GET /users/manual/import/template) — le contrat POST /users/manual/import
 *  lit ces mêmes noms de colonnes côté frontend. */
export const MANUAL_USERS_CSV_HEADERS = [
  'identifiant', 'prenom', 'nom', 'email', 'service', 'filiale', 'actif',
];

/** Forme minimale attendue par buildManualUsersExportCsv — un sous-ensemble
 *  du modèle Prisma User, filiale incluse. */
export interface ManualUserExportRow {
  samAccountName: string;
  displayName: string;
  email: string | null;
  department: string | null;
  active: boolean;
  filiale: { name: string } | null;
}

/** Fichier complet au format commun de common/csv (BOM UTF-8, séparateur
 *  `;`, cellules protégées contre l'injection de formule). */
function toCsv(rows: string[][]): string {
  return buildCsv({ header: MANUAL_USERS_CSV_HEADERS, rows });
}

/**
 * Construit le CSV d'export des collaborateurs créés à la main. Fonction
 * pure. Le prénom et le nom sont retrouvés
 * depuis le displayName (« Prénom NOM ») par splitManualDisplayName : le
 * fichier exporté peut être modifié puis réimporté tel quel.
 */
export function buildManualUsersExportCsv(users: ManualUserExportRow[]): string {
  const rows = users.map((u) => {
    const { firstName, lastName } = splitManualDisplayName(u.displayName);
    return [
      u.samAccountName,
      firstName,
      lastName,
      u.email ?? '',
      u.department ?? '',
      u.filiale?.name ?? '',
      u.active ? 'oui' : 'non',
    ];
  });
  return toCsv(rows);
}

/**
 * Construit le CSV « modèle » (GET /users/manual/import/template) : même
 * en-tête que l'export, une ligne de commentaire (préfixée `#`) qui rappelle
 * les valeurs acceptées — dont la liste des filiales actives — puis une ligne
 * d'exemple, commentée elle aussi, pour qu'un administrateur sache quoi
 * remplir sans documentation. Les lignes `#` sont ignorées à l'import.
 */
export function buildManualUsersImportTemplateCsv(activeFilialeNames: string[]): string {
  const filiales = activeFilialeNames.length > 0 ? activeFilialeNames.join(', ') : '(aucune filiale active)';
  // Chaque rappel est placé sous la colonne qu'il décrit.
  const reminder = [
    `# Valeurs acceptées (${IMPORT_MANUAL_USERS_MAX_ITEMS} lignes maximum) — identifiant : vide pour créer, identifiant exporté pour mettre à jour`,
    'obligatoire',
    'obligatoire',
    "facultatif ; adresse valide, jamais celle d'un compte de l'annuaire",
    'facultatif, texte libre',
    `facultatif ; une filiale active parmi : ${filiales}`,
    'oui ou non (vide = oui à la création, inchangé sinon)',
  ];
  const example = [
    '# Exemple — à remplacer par vos valeurs',
    'Jean',
    'Dupont',
    '',
    'Chantier',
    activeFilialeNames[0] ?? '',
    'oui',
  ];
  return toCsv([reminder, example]);
}
