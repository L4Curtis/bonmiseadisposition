import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { EncryptionService } from '../config/encryption.service';
import type { DocumentSignatures } from './document-signatures';
import type { PdfSignature, SigImages } from './pdf-types';

/**
 * Images des signatures d'un document, lues et déchiffrées par le PDF
 * lui-même : l'image de chaque case est TOUJOURS celle de la signature
 * retenue pour ce document (R-030), jamais une image fournie à part.
 */

export interface SignatureImageStore {
  encryption: EncryptionService;
  /** Répertoire des signatures manuscrites chiffrées. */
  signaturesDir: string;
}

/** URL `data:` d'une image de signature stockée sur disque, ou `null` si le
 *  fichier est absent, illisible ou hors du répertoire des signatures. */
export async function readSignatureImage(
  store: SignatureImageStore,
  signatureImagePath: string | null | undefined,
): Promise<string | null> {
  if (!signatureImagePath) return null;
  try {
    const base = basename(signatureImagePath);
    if (base !== signatureImagePath || base.includes('..')) return null;
    const fullPath = join(store.signaturesDir, base);
    if (!fullPath.startsWith(store.signaturesDir) || !existsSync(fullPath)) return null;
    const raw = store.encryption.decrypt(await readFile(fullPath, 'utf8'));
    return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
  } catch {
    return null;
  }
}

async function imageOf(store: SignatureImageStore, sig: PdfSignature | null): Promise<string | null> {
  return sig ? readSignatureImage(store, sig.signatureImagePath) : null;
}

export async function loadDocumentSignatureImages(
  store: SignatureImageStore,
  selection: DocumentSignatures,
): Promise<SigImages> {
  const [it, collab] = await Promise.all([imageOf(store, selection.it), imageOf(store, selection.collab)]);
  return { it, collab };
}
