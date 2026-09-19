import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfSnapshotType } from '../common/types';

/**
 * GET /bons/:id/pdf — validation des paramètres de requête et résolution du
 * snapshot PDF stocké (snapshot d'étape explicite, snapshot par défaut du
 * type demandé, puis colonnes legacy). Extrait de BonsController.getPdf
 * sans changement de comportement — le contrôleur conserve la génération à
 * la volée (dépend de PdfService/SignatureService) et l'écriture de la
 * réponse HTTP.
 */
export function assertValidPdfQuery(type: string, stage?: string): void {
  // Validate enum-typed query params explicitly (a raw cast used to surface
  // as a Prisma validation error → HTTP 500 instead of 400)
  if (!['mise_disposition', 'restitution'].includes(type)) {
    throw new BadRequestException(`Type de PDF inconnu : ${type}`);
  }
  const validStages = Object.values(PdfSnapshotType) as string[];
  if (stage && !validStages.includes(stage)) {
    throw new BadRequestException(`Étape de snapshot inconnue : ${stage}`);
  }
}

export interface ResolvedBonPdf {
  filename: string;
  data: Buffer;
}

/**
 * Résout le PDF déjà stocké à servir, par ordre de priorité : étape
 * explicitement demandée (`stage`), snapshot par défaut du `type`, puis
 * repli sur les colonnes legacy. `null` si rien n'est stocké — le contrôleur
 * génère alors le PDF à la volée.
 */
export async function resolveBonPdf(
  prisma: PrismaService,
  bon: { id: string; reference: string },
  type: 'mise_disposition' | 'restitution',
  stage?: string,
): Promise<ResolvedBonPdf | null> {
  // If specific stage requested, serve from PdfSnapshot table
  if (stage) {
    const pdfSnapshot = await prisma.pdfSnapshot.findUnique({
      where: { bonId_type: { bonId: bon.id, type: stage as PdfSnapshotType } },
    });
    if (pdfSnapshot) {
      return { filename: pdfSnapshot.filename, data: Buffer.from(pdfSnapshot.data) };
    }
  }

  // Default: serve best available snapshot
  const snapshotType: PdfSnapshotType = type === 'restitution'
    ? 'signature_collab_restitution'
    : 'signature_collab_mise_disposition';
  const pdfSnapshot = await prisma.pdfSnapshot.findUnique({
    where: { bonId_type: { bonId: bon.id, type: snapshotType } },
  });
  if (pdfSnapshot) {
    return { filename: pdfSnapshot.filename, data: Buffer.from(pdfSnapshot.data) };
  }

  // Fallback: query legacy snapshot columns directly (not in BON_SELECT)
  const legacyBon = await prisma.bon.findUnique({
    where: { id: bon.id },
    select: { pdfMiseDispoSnapshot: true, pdfRestitutionSnapshot: true },
  });
  const legacySnapshot =
    type === 'restitution'
      ? legacyBon?.pdfRestitutionSnapshot
      : legacyBon?.pdfMiseDispoSnapshot;

  if (legacySnapshot) {
    return { filename: `bon-${bon.reference}.pdf`, data: Buffer.from(legacySnapshot) };
  }

  return null;
}
