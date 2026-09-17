import { BadRequestException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { EncryptionService } from '../config/encryption.service';
import { SigImages, BonForPdf } from '../pdf/pdf.service';
import { SignatureEntry } from '../common/types';
import { assertPngDataUrl } from '../common/signature-data-url';

/** Dépendances explicites requises par les helpers de ce module — aucune n'est
 *  un nouveau provider Nest : ce sont les mêmes instances déjà injectées dans
 *  SignatureService, simplement passées en paramètre. */
export interface SignatureFileStoreDeps {
  encryption: EncryptionService;
  uploadsDir: string;
  logger: Logger;
}

/** Encrypt and persist a signature PNG to disk, returning its filename. */
export async function saveSignatureFile(
  deps: SignatureFileStoreDeps,
  bonId: string,
  type: string,
  dataUrl: string,
): Promise<string> {
  assertPngDataUrl(dataUrl);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

  try {
    const encrypted = deps.encryption.encrypt(base64);
    const filename = `${bonId}_${type}_${Date.now()}.enc`;
    const filepath = path.join(deps.uploadsDir, filename);
    await writeFile(filepath, encrypted, 'utf8');
    return filename;
  } catch (err) {
    deps.logger.error(`Échec sauvegarde signature (bon=${bonId}, type=${type}): ${(err as Error).message}`);
    throw new BadRequestException('Erreur lors de la sauvegarde de la signature');
  }
}

/** Get decrypted signature image for PDF generation */
export async function getSignatureImageDecrypted(
  deps: SignatureFileStoreDeps,
  signatureImagePath: string,
): Promise<string | null> {
  try {
    // Path traversal protection: reject directory traversal attempts
    const basename = path.basename(signatureImagePath);
    if (basename !== signatureImagePath || signatureImagePath.includes('..') || signatureImagePath.includes('/') || signatureImagePath.includes('\\')) {
      deps.logger.warn(`Path traversal attempt blocked: ${signatureImagePath}`);
      return null;
    }
    const fullPath = path.join(deps.uploadsDir, basename);
    // Verify resolved path stays within UPLOADS_DIR
    if (!fullPath.startsWith(deps.uploadsDir)) return null;
    if (!fs.existsSync(fullPath)) return null;
    const encrypted = await readFile(fullPath, 'utf8');
    return deps.encryption.decrypt(encrypted);
  } catch {
    return null;
  }
}

/** Build SigImages with only the relevant signatures for a given snapshot type */
export async function buildSigImagesForSnapshot(
  deps: SignatureFileStoreDeps,
  bon: BonForPdf,
  snapshotType: string,
): Promise<SigImages> {
  const sigImages: SigImages = { it: null, collab: null };
  const signatures = bon.signatures || [];

  for (const sig of signatures) {
    if (!sig.signed || !sig.signatureImagePath) continue;
    const raw = await getSignatureImageDecrypted(deps, sig.signatureImagePath);
    if (!raw) continue;
    const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;

    if (sig.type === 'it_cachet') {
      sigImages.it = src;
    } else if (snapshotType === 'cloture_equipements_manquants') {
      // For PV cloture final snapshot (collab signed): use pv_cloture sig
      if (sig.type === 'pv_cloture') {
        sigImages.collab = src;
      }
    } else if (snapshotType.includes('collab')) {
      // For collab snapshots, include the collab signature matching the context
      const isRestitutionSnapshot = snapshotType.includes('restitution');
      const isRestitutionSig = sig.type === 'restitution';
      if (isRestitutionSnapshot === isRestitutionSig) {
        sigImages.collab = src;
      }
    }
    // For IT-only snapshots (signature_it_*), don't include collab signature
  }

  return sigImages;
}

/** Resolve decrypted SigImages for a list of signatures (used by BonsController for on-the-fly PDF) */
export async function getSignatureImagesForBon(
  deps: SignatureFileStoreDeps,
  signatures: SignatureEntry[],
): Promise<SigImages> {
  const sigImages: SigImages = { it: null, collab: null };
  for (const sig of signatures || []) {
    if (!sig.signed || !sig.signatureImagePath) continue;
    const raw = await getSignatureImageDecrypted(deps, sig.signatureImagePath);
    if (!raw) continue;
    const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
    if (sig.type === 'it_cachet') {
      sigImages.it = src;
    } else {
      sigImages.collab = src;
    }
  }
  return sigImages;
}
