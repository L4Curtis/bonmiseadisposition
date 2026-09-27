import { Logger } from '@nestjs/common';
import { PdfService, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { documentFilename } from '../pdf/snapshot-filename';

export interface PdfSnapshotDeps {
  pdfService: PdfService;
  smbService: SmbService;
  logger: Logger;
}

/**
 * Génère et enregistre le PDF d'un document (le PDF choisit lui-même les
 * signatures de ce document), sous un nom lisible et daté, propre à ce
 * document : il ne remplace jamais un document précédent du même type. Puis
 * le copie sur le partage SMB sans attendre — sauf s'il existait déjà.
 */
export async function generatePdfSnapshot(
  deps: PdfSnapshotDeps,
  bon: BonForPdf,
  snapshotType: string,
): Promise<void> {
  const saved = await deps.pdfService.saveDocument(bon, snapshotType, documentFilename(bon, snapshotType, new Date()));
  if (!saved.created) return;

  deps.smbService.exportPdf(bon, saved.filename, saved.pdf).catch((err) =>
    deps.logger.error(`Échec export SMB: ${(err as Error).message}`),
  );
}
