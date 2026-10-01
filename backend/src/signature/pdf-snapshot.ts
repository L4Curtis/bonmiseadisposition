import { Logger } from '@nestjs/common';
import { PdfService, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { documentFilename } from '../pdf/snapshot-filename';
import { writeAuditEntry } from '../audit/audit-record';
import type { AuditWriter } from '../audit/audit-record';

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

/**
 * Trace un document PDF non produit (`pdf_snapshot_failed`) après une action
 * déjà validée : la signature ou la transition reste acquise, le document se
 * régénère ensuite (POST /admin/pdf/regenerate-missing). Ne lève jamais : un
 * échec d'écriture du journal est seulement signalé au journal du serveur.
 */
export async function recordSnapshotFailure(
  writer: AuditWriter,
  logger: Pick<Logger, 'error'>,
  failure: { bonId: string; type: string; message: string },
): Promise<void> {
  try {
    await writeAuditEntry(writer, 'pdf_snapshot_failed', {
      bonId: failure.bonId,
      details: { type: failure.type, error: failure.message },
    });
  } catch (err) {
    logger.error(`Entrée d'audit pdf_snapshot_failed non écrite : ${err instanceof Error ? err.message : String(err)}`);
  }
}
