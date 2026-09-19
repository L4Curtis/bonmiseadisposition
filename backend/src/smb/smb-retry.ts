import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { SmbBon } from '../common/types';
import { SmbExportResult } from './smb.types';
import { isSafeSmbExportPath } from './smb-path-safety';
import { computeSmbExportTarget, writeSmbExportFile } from './smb-export-writer';

/** Retrouve, parmi les snapshots PDF d'un bon, celui qui correspond EXACTEMENT
 *  au nom de fichier de l'export SMB. Correspondance exacte uniquement : le
 *  schéma actuel (SmbExport) n'a pas de champ dédié (type de snapshot, sha256)
 *  pour relier de façon fiable un export à SON document — un fallback (ex. le
 *  snapshot le plus récent) écrirait un document ARBITRAIRE sous ce nom de
 *  fichier, inacceptable pour une preuve légale. */
export function findMatchingSnapshot<T extends { filename: string }>(
  snapshots: T[],
  filename: string,
): T | undefined {
  return snapshots.find((s) => s.filename === filename);
}

/** Marque un export en échec faute de snapshot correspondant (voir
 *  findMatchingSnapshot ci-dessus). */
export async function markSnapshotMissing(
  prisma: PrismaService,
  logger: Logger,
  exportId: string,
  bonReference: string,
  filename: string,
): Promise<SmbExportResult> {
  const errorMessage = 'Snapshot introuvable pour ce fichier';
  logger.error(`SMB retry: ${errorMessage} [bon=${bonReference}, fichier=${filename}]`);
  await prisma.smbExport.update({
    where: { id: exportId },
    data: { status: 'failed', errorMessage, lastAttemptAt: new Date() },
  });
  return { success: false, error: errorMessage };
}

export interface SmbRetryDeps {
  prisma: PrismaService;
  logger: Logger;
  sanitizeName: (name: string) => string;
}

/** Réessaie un export SMB déjà en échec, sur le chemin actuellement configuré. */
export async function retrySmbExport(
  deps: SmbRetryDeps,
  smbPath: string,
  exportId: string,
  bon: SmbBon,
  filename: string,
  pdfBuffer: Buffer,
): Promise<SmbExportResult> {
  const { prisma, logger, sanitizeName } = deps;

  if (!smbPath || !isSafeSmbExportPath(smbPath)) {
    return { success: false, error: 'Chemin SMB invalide' };
  }

  // Comme pour l'export initial : la racine du partage ne doit jamais être
  // créée automatiquement — son absence signale un partage non monté.
  if (!fs.existsSync(smbPath)) {
    const msg = `Le chemin d'export n'existe pas ou le partage n'est pas monté : ${smbPath}`;
    logger.error(`SMB retry: ${msg}`);
    return { success: false, error: msg };
  }

  await prisma.smbExport.update({
    where: { id: exportId },
    data: { retryCount: { increment: 1 } },
  });

  try {
    const target = computeSmbExportTarget(smbPath, bon, filename, sanitizeName);
    await writeSmbExportFile(target, pdfBuffer);

    await prisma.smbExport.update({
      where: { id: exportId },
      data: { status: 'success', lastAttemptAt: new Date(), errorMessage: null },
    });

    logger.log(`SMB retry réussi: ${bon.reference}/${target.safeFilename}`);
    return { success: true };
  } catch (err) {
    const errorMsg = (err as Error).message;
    await prisma.smbExport.update({
      where: { id: exportId },
      data: { status: 'failed', errorMessage: errorMsg, lastAttemptAt: new Date() },
    });
    logger.error(`SMB retry échoué [${bon.reference}/${filename}]: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
