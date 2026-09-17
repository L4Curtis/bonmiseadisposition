import { Logger } from '@nestjs/common';
import { PdfService, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { SignatureFileStoreDeps, buildSigImagesForSnapshot } from './signature-file-store';

export interface PdfSnapshotDeps {
  pdfService: PdfService;
  smbService: SmbService;
  logger: Logger;
  fileStore: SignatureFileStoreDeps;
}

/** Génère et sauvegarde en DB le snapshot PDF au moment de la signature, puis
 *  l'exporte vers le partage SMB (fire & forget, comme dans SignatureService). */
export async function generatePdfSnapshot(
  deps: PdfSnapshotDeps,
  bon: BonForPdf,
  snapshotType: string,
): Promise<void> {
  const sigImages = await buildSigImagesForSnapshot(deps.fileStore, bon, snapshotType);
  const collabName = deps.smbService.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
  const filename = `${bon.reference}_${collabName}_${snapshotType}.pdf`;
  const pdfBuffer = await deps.pdfService.generateAndSave(bon, snapshotType, sigImages, filename);

  // Export to SMB share (fire & forget)
  deps.smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
    deps.logger.error(`Échec export SMB: ${(err as Error).message}`),
  );
}
