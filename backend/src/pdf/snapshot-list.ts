import type { PdfSnapshotType, SignatureInvalidationReason, SignatureType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { PdfSnapshotInfo } from '../contracts/bons';
import { DocumentAudience, audienceWhere } from './snapshot-audience';

/**
 * Liste des documents d'un bon (GET /bons/:id/pdf-snapshots) : TOUS les
 * documents enregistrés, du plus ancien au plus récent, chacun avec sa date,
 * son empreinte, son rang parmi ceux du même type et, s'il ne vaut plus,
 * pourquoi. La fiche IT la lit telle quelle ; le portail du collaborateur
 * reçoit seulement les documents qu'il peut garder (snapshot-audience.ts),
 * rangs comptés parmi ceux-là.
 */

/** Une ligne de `pdf_snapshots`, telle que lue pour la liste. */
export interface DocumentRow {
  id: string;
  type: PdfSnapshotType;
  filename: string;
  createdAt: Date;
  sha256: string | null;
  signature: {
    type: SignatureType;
    invalidatedAt: Date | null;
    invalidatedReason: SignatureInvalidationReason | null;
  } | null;
}

function sameTypeCount(rows: readonly DocumentRow[], type: PdfSnapshotType): number {
  return rows.filter((r) => r.type === type).length;
}

/** Met en forme des lignes déjà triées (plus ancien d'abord). Un bon compte
 *  au plus quelques dizaines de documents : le décompte direct suffit. */
export function toDocumentList(rows: readonly DocumentRow[]): PdfSnapshotInfo[] {
  return rows.map((row, index) => {
    const sequence = sameTypeCount(rows.slice(0, index + 1), row.type);
    const sequenceCount = sameTypeCount(rows, row.type);
    const invalidated = row.signature?.invalidatedAt ?? null;
    return {
      id: row.id,
      type: row.type,
      filename: row.filename,
      createdAt: row.createdAt.toISOString(),
      sha256: row.sha256,
      signatureType: row.signature?.type ?? null,
      sequence,
      sequenceCount,
      latest: sequence === sequenceCount,
      supersededAt: invalidated ? invalidated.toISOString() : null,
      supersededReason: invalidated ? row.signature?.invalidatedReason ?? null : null,
    };
  });
}

export async function listBonDocuments(
  prisma: PrismaService,
  bonId: string,
  audience: DocumentAudience,
): Promise<PdfSnapshotInfo[]> {
  const rows = await prisma.pdfSnapshot.findMany({
    where: { bonId, ...audienceWhere(audience) },
    select: {
      id: true,
      type: true,
      filename: true,
      createdAt: true,
      sha256: true,
      signature: { select: { type: true, invalidatedAt: true, invalidatedReason: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return toDocumentList(rows);
}
