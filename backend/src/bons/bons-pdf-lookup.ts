import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfSnapshotType } from '../common/types';
import { findDocumentById, findLatestDocument } from '../pdf/snapshot-store';
import type { DocumentAudience } from '../pdf/snapshot-audience';

/**
 * GET /bons/:id/pdf — validation des paramètres de requête et résolution du
 * document PDF stocké (document précis, version en vigueur d'une étape,
 * document signé par défaut du type demandé, puis colonnes legacy). Extrait de BonsController.getPdf
 * sans changement de comportement — le contrôleur conserve la génération à
 * la volée (dépend de PdfService/SignatureService) et l'écriture de la
 * réponse HTTP.
 */
export function assertValidPdfQuery(type: string, stage?: string, snapshot?: string): void {
  // Validate enum-typed query params explicitly (a raw cast used to surface
  // as a Prisma validation error → HTTP 500 instead of 400)
  if (!['mise_disposition', 'restitution'].includes(type)) {
    throw new BadRequestException(`Type de PDF inconnu : ${type}`);
  }
  const validStages = Object.values(PdfSnapshotType) as string[];
  if (stage && !validStages.includes(stage)) {
    throw new BadRequestException(`Étape de snapshot inconnue : ${stage}`);
  }
  if (snapshot !== undefined && !UUID_PATTERN.test(snapshot)) {
    throw new BadRequestException('Identifiant de document invalide');
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedBonPdf {
  filename: string;
  data: Buffer;
}

/**
 * Résout le PDF déjà stocké à servir, par ordre de priorité : document précis
 * demandé (`snapshot`, un identifiant de la liste des documents — 404 s'il
 * n'appartient pas au bon), étape demandée (`stage` : la version en vigueur
 * de ce type, la plus récente), document signé par défaut du `type`, puis
 * repli sur les colonnes legacy. `null` si rien n'est stocké — le contrôleur
 * génère alors le PDF à la volée. Un compte non IT ne reçoit jamais une
 * version signée par l'IT seule (`audience`, voir snapshot-audience.ts).
 */
export async function resolveBonPdf(
  prisma: PrismaService,
  bon: { id: string; reference: string },
  type: 'mise_disposition' | 'restitution',
  stage: string | undefined,
  snapshot: string | undefined,
  audience: DocumentAudience,
): Promise<ResolvedBonPdf | null> {
  if (snapshot) {
    const document = await findDocumentById(prisma, bon.id, snapshot, audience);
    if (!document) throw new NotFoundException('Document introuvable pour ce bon');
    return { filename: document.filename, data: Buffer.from(document.data) };
  }

  if (stage) {
    const latestOfStage = await findLatestDocument(prisma, bon.id, stage as PdfSnapshotType, audience);
    if (latestOfStage) {
      return { filename: latestOfStage.filename, data: Buffer.from(latestOfStage.data) };
    }
  }

  // Par défaut : le dernier document signé par le collaborateur pour ce type.
  const snapshotType: PdfSnapshotType = type === 'restitution'
    ? 'signature_collab_restitution'
    : 'signature_collab_mise_disposition';
  const signed = await findLatestDocument(prisma, bon.id, snapshotType, audience);
  if (signed) {
    return { filename: signed.filename, data: Buffer.from(signed.data) };
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
