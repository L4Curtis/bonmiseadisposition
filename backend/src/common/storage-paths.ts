import { isAbsolute, join, relative, resolve, sep } from 'path';

/**
 * Emplacements des fichiers de l'application. Tout vit sous `data/`, à la
 * racine du processus : c'est le volume Docker sauvegardé avec la base.
 */

/** Racine des données persistantes. */
export const DATA_DIR = join(process.cwd(), 'data');

/** Logos et cachets des filiales. */
export const UPLOADS_DIR = join(DATA_DIR, 'uploads');

/** Tracés de signature (collaborateur et IT), chiffrés. */
export const SIGNATURES_DIR = join(DATA_DIR, 'signatures');

/** Pièces jointes des bons, chiffrées. */
export const ATTACHMENTS_DIR = join(DATA_DIR, 'attachments');

/** Mot de passe initial du compte administrateur local, écrit au premier démarrage. */
export const INITIAL_ADMIN_PASSWORD_FILE = join(DATA_DIR, 'initial-admin-password.txt');

/**
 * Chemin absolu d'un fichier désigné par un chemin relatif à `data/`, tel
 * qu'il est rangé en base (ex. `uploads/logo.png` pour le logo d'une
 * filiale). Refuse tout chemin qui sortirait du dossier de données.
 */
export function dataPath(relativePath: string): string {
  const full = resolve(DATA_DIR, relativePath);
  const fromData = relative(DATA_DIR, full);
  const escapes = fromData === '..' || fromData.startsWith(`..${sep}`) || isAbsolute(fromData);
  if (!relativePath || !fromData || escapes) {
    throw new Error(`Chemin hors du dossier de données : ${relativePath}`);
  }
  return full;
}
