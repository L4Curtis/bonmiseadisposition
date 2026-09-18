/**
 * Aides pures pour la création de comptes manuels (compagnons de chantier
 * sans compte Active Directory) : formatage de l'affichage et génération d'un
 * samAccountName unique. Aucune dépendance à Prisma ici — la résolution des
 * collisions est injectée (voir generateUniqueManualSamAccountName) pour
 * rester testable sans base de données.
 */

// Préfixe explicite : un samAccountName "manuel.jean.dupont" ne doit jamais
// pouvoir être confondu avec un identifiant importé de l'annuaire AD (qui ne
// contient normalement pas de point en tête ni le mot "manuel").
const MANUAL_SAM_ACCOUNT_PREFIX = 'manuel';

/** Réduit un prénom/nom à un fragment d'identifiant : accents retirés,
 *  minuscules, tout ce qui n'est pas alphanumérique devient un tiret (espaces,
 *  apostrophes, tirets déjà présents…), tirets de tête/fin retirés. */
function slugifyNamePart(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Filet de sécurité : ne devrait jamais se produire (firstName/lastName
  // sont déjà validés non-vides par CreateManualUserDto), mais un samAccountName
  // vide casserait la contrainte @unique de façon peu lisible.
  return slug || 'x';
}

/** displayName imposé par le contrat métier : "<Prénom> <NOM EN MAJUSCULES>". */
export function buildManualDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim().toUpperCase()}`;
}

/**
 * Retrouve prénom/nom à partir d'un displayName déjà construit par
 * buildManualDisplayName — utilisé par PATCH /users/:id/manual quand un seul
 * des deux champs est fourni (le displayName doit être recalculé en entier,
 * mais l'appelant n'a donné qu'une moitié). Découpe sur le DERNIER espace :
 * correct pour l'immense majorité des cas ("Jean DUPONT"), mais un nom de
 * famille composé de plusieurs mots ("VAN DER BERG") serait mal réparti — cas
 * volontairement non géré ici : PATCH avec les deux champs à la fois reste la
 * façon fiable de corriger un tel nom.
 */
export function splitManualDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim(),
  };
}

/** Base du samAccountName avant résolution des collisions, ex. "manuel.jean.dupont". */
export function buildManualSamAccountBase(firstName: string, lastName: string): string {
  return `${MANUAL_SAM_ACCOUNT_PREFIX}.${slugifyNamePart(firstName)}.${slugifyNamePart(lastName)}`;
}

/**
 * Résout les collisions en suffixant `-2`, `-3`, … jusqu'à trouver un
 * identifiant libre. `exists` est fourni par l'appelant (vérification en
 * base) — cette fonction reste pure et testable sans Prisma.
 */
export async function generateUniqueManualSamAccountName(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let suffix = 2;
  // Borne haute par précaution (évite une boucle infinie en cas de bug dans
  // `exists`) — largement au-delà de tout cas réel (homonymes multiples).
  const MAX_ATTEMPTS = 1000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- résolution séquentielle nécessaire : chaque essai dépend du résultat du précédent
    if (!(await exists(candidate))) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  throw new Error(`Impossible de générer un samAccountName unique à partir de "${base}"`);
}
