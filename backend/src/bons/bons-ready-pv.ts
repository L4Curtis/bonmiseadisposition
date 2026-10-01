import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PdfService } from '../pdf/pdf.service';
import { documentFilename } from '../pdf/snapshot-filename';

/**
 * « PV prêt » : des équipements ont été déclarés non restitués et l'IT a déjà
 * certifié le PV de non-restitution par sa signature, mais d'autres
 * équipements sont encore chez le collaborateur. Le PV ne part qu'à leur
 * retour : il n'est pas encore émis ni enregistré. L'IT peut pourtant le
 * consulter tel qu'il partirait aujourd'hui (GET /bons/:id/pdf/pv-pret),
 * généré à la volée, sans rien enregistrer ni envoyer.
 */

/** Signature, telle que lue pour trouver celle qui certifie le PV. */
export interface ReadyPvCandidate {
  id: string;
  type: string;
  signed: boolean;
  pdfType: string | null;
  signedAt: Date | null;
  invalidatedAt: Date | null;
}

/** Dernière signature IT valable du PV de non-restitution, ou `null`. */
export function findPvItSignature<T extends ReadyPvCandidate>(signatures: readonly T[]): T | null {
  const candidates = signatures
    .filter((s) => s.type === 'it_cachet' && s.signed && s.pdfType === 'pv_cloture' && !s.invalidatedAt && s.signedAt)
    .sort((a, b) => (a.signedAt?.getTime() ?? 0) - (b.signedAt?.getTime() ?? 0));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

const NO_READY_PV =
  'Aucun PV de non-restitution en attente de départ pour ce bon : un PV déjà émis se télécharge dans la liste des documents.';

export interface ReadyPvDocument {
  filename: string;
  data: Buffer;
}

/**
 * Génère le PV prêt. 404 s'il n'y en a pas : pas de signature IT du PV, ou
 * PV déjà émis avec cette signature (il est alors dans la liste des documents).
 */
export async function renderReadyPv(
  deps: { prisma: PrismaService; pdfService: PdfService },
  bon: Parameters<PdfService['generateBonPdf']>[0] & { id: string; reference: string },
): Promise<ReadyPvDocument> {
  const signatures = await deps.prisma.signature.findMany({ where: { bonId: bon.id } });
  const itSignature = findPvItSignature(signatures);
  if (!itSignature) throw new NotFoundException(NO_READY_PV);
  const emitted = await deps.prisma.pdfSnapshot.count({
    where: { bonId: bon.id, type: 'cloture_equipements_manquants', signatureId: itSignature.id },
  });
  if (emitted > 0) throw new NotFoundException(NO_READY_PV);
  const data = await deps.pdfService.generateBonPdf({ ...bon, signatures }, null, 'cloture');
  const filename = documentFilename(bon, 'cloture_equipements_manquants', itSignature.signedAt ?? new Date(), { itVersion: true });
  return { filename, data };
}
