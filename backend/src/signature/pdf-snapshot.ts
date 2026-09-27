import { Logger } from '@nestjs/common';
import { PdfService, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';

export interface PdfSnapshotDeps {
  pdfService: PdfService;
  smbService: SmbService;
  logger: Logger;
}

/** Nom du fichier d'un document : référence, collaborateur, type. */
export function snapshotFilename(deps: Pick<PdfSnapshotDeps, 'smbService'>, bon: BonForPdf, snapshotType: string): string {
  const collabName = deps.smbService.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
  return `${bon.reference}_${collabName}_${snapshotType}.pdf`;
}

/** Génère et enregistre le PDF d'un document (le PDF choisit lui-même les
 *  signatures de ce document), puis le copie sur le partage SMB sans attendre. */
export async function generatePdfSnapshot(
  deps: PdfSnapshotDeps,
  bon: BonForPdf,
  snapshotType: string,
): Promise<void> {
  const filename = snapshotFilename(deps, bon, snapshotType);
  const pdfBuffer = await deps.pdfService.generateAndSave(bon, snapshotType, null, filename);

  // Export to SMB share (fire & forget)
  deps.smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
    deps.logger.error(`Échec export SMB: ${(err as Error).message}`),
  );
}
