import { BadRequestException } from '@nestjs/common';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'node:crypto';
import { UPLOADS_DIR, dataPath } from '../common/storage-paths';

/** Taille max de l'image décodée (logo/cachet) acceptée à l'import CSV. */
export const MAX_FILIALE_IMAGE_BYTES = 2 * 1024 * 1024; // 2 Mo

// Les images sont rangées dans UPLOADS_DIR, le dossier du `diskStorage` de
// FilialesModule (dépôt par formulaire) : la génération des PDF et
// FilialesService#deleteFile lisent ou purgent de la même façon un fichier
// déposé par formulaire ou par import CSV. Aucune route HTTP ne sert ces
// fichiers : un cachet ne sort du serveur qu'imprimé sur un PDF.

/** Une data URL (data:image/xxx;base64,....) est acceptée en plus d'une
 *  chaîne base64 nue — seul le préfixe est reconnu, le type annoncé n'est
 *  jamais utilisé pour la validation (voir detectImageExtension ci-dessous). */
const DATA_URL_PREFIX = /^data:image\/[a-z0-9.+-]+;base64,/i;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Détecte PNG/JPEG par octets magiques uniquement — jamais par extension ou
 *  Content-Type annoncé (cohérent avec attachments.service.ts#sniffMime et
 *  common/signature-data-url.ts#assertPngDataUrl). */
function detectImageExtension(buf: Buffer): 'png' | 'jpg' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

/**
 * Décode, valide et écrit sur disque une image logo/cachet fournie en
 * base64 lors de l'import CSV des filiales (POST /filiales/import).
 *
 * Contrôles appliqués, dans l'ordre :
 * 1. décodage base64 (préfixe data URL toléré et retiré) ;
 * 2. taille décodée non nulle et ≤ MAX_FILIALE_IMAGE_BYTES ;
 * 3. type réel PNG ou JPEG (octets d'en-tête — jamais le nom/type annoncé) ;
 * 4. écriture sous un nom généré par l'application (UUID + extension
 *    déduite du type détecté — jamais un nom fourni par l'appelant), dans le
 *    même répertoire que l'upload existant du module filiales.
 *
 * Lève une BadRequestException avec un message clair sur tout échec ;
 * l'appelant (filiales-import.ts) capture cette exception pour ne faire
 * échouer QUE la ligne concernée, sans interrompre le reste du lot.
 *
 * @returns le chemin relatif à persister dans `logoPath`/`stampPath`
 *          (`uploads/<uuid>.<ext>`), au même format que
 *          FilialesService#updateLogo/#updateStamp.
 */
export async function saveFilialeImageFromBase64(raw: string, fieldLabel: string): Promise<string> {
  const base64 = DATA_URL_PREFIX.test(raw) ? raw.slice(raw.indexOf(',') + 1) : raw;

  // Buffer.from(..., 'base64') ne lève jamais (les caractères hors alphabet
  // base64 sont simplement ignorés) — un contenu non-base64 produit un
  // buffer décodable mais dont les octets d'en-tête échoueront la détection
  // de type ci-dessous.
  const decoded = Buffer.from(base64, 'base64');

  if (decoded.length === 0) {
    throw new BadRequestException(`${fieldLabel} : contenu base64 invalide.`);
  }
  if (decoded.length > MAX_FILIALE_IMAGE_BYTES) {
    throw new BadRequestException(`${fieldLabel} : image trop volumineuse (max 2 Mo).`);
  }

  const ext = detectImageExtension(decoded);
  if (!ext) {
    throw new BadRequestException(`${fieldLabel} : format non supporté (PNG ou JPEG uniquement).`);
  }

  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(UPLOADS_DIR, filename), decoded);
  return `uploads/${filename}`;
}

/** Supprime (best-effort) un fichier logo/cachet déjà référencé, remplacé
 *  par une nouvelle image à l'import — même logique que
 *  FilialesService#deleteFile (dupliquée ici : ce module est appelé depuis
 *  filiales-import.ts, hors du service, pour rester une fonction pure et
 *  testable indépendamment). Un échec de suppression n'est jamais bloquant :
 *  au pire un fichier orphelin reste sur disque. Un chemin qui sortirait de
 *  data/ n'est jamais supprimé. */
export async function deleteFilialeUpload(relativePath: string): Promise<void> {
  try {
    const fullPath = dataPath(relativePath);
    if (existsSync(fullPath)) await unlink(fullPath);
  } catch {
    // best-effort : un fichier orphelin résiduel n'est pas bloquant
  }
}
