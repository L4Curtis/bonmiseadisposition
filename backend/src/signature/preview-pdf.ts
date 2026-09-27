import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { NOT_RECIPIENT_MESSAGE, isRecipient } from './recipient';
import { unusableLinkMessage } from './token';


export interface PreviewPdfDeps {
  prisma: PrismaService;
  pdfService: PdfService;
}

/**
 * Aperçu du document EXACT qui sera signé (chaîne de preuve : le signataire
 * voit l'artefact final, pas seulement la page web). Mêmes contrôles d'accès
 * que getBonInfoByToken : token valide, non signé, destinataire uniquement
 * (sauf présentiel). Extrait de SignatureService.getPreviewPdfByToken.
 */
export async function getPreviewPdfByToken(
  deps: PreviewPdfDeps,
  token: string,
  requesterEmail?: string,
  requesterId?: string,
): Promise<{ pdf: Buffer; filename: string }> {
  const sig = await deps.prisma.signature.findUnique({
    where: { token },
    include: { bon: { select: BON_FOR_SIGNATURE_SELECT } },
  });
  if (!sig) throw new NotFoundException('Lien de signature invalide');
  if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
  if (!isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId)) {
    throw new ForbiddenException(NOT_RECIPIENT_MESSAGE);
  }
  if (new Date() > sig.tokenExpiresAt) throw new BadRequestException(unusableLinkMessage(sig, sig.bon.status));

  // Le lien en attente est le plus récent de ce document : le PDF laisse donc
  // la case du collaborateur vide (document-signatures.ts).
  const documentType =
    sig.type === 'pv_cloture' ? 'cloture' : sig.type === 'restitution' ? 'restitution' : 'mise_disposition';
  const pdf = await deps.pdfService.generateBonPdf(sig.bon, null, documentType);
  return { pdf, filename: `apercu-${sig.bon.reference}.pdf` };
}
