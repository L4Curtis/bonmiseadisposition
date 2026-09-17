import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { isRecipient } from './recipient';
import { expiredMessage } from './token';
import { SignatureFileStoreDeps, getSignatureImagesForBon } from './signature-file-store';

export interface PreviewPdfDeps {
  prisma: PrismaService;
  pdfService: PdfService;
  fileStore: SignatureFileStoreDeps;
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
  if (new Date() > sig.tokenExpiresAt) throw new BadRequestException(expiredMessage(sig.tokenExpiresAt));
  if (!isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId)) {
    throw new ForbiddenException('Ce document est destiné à un autre collaborateur');
  }

  const documentType =
    sig.type === 'pv_cloture' ? 'cloture' : sig.type === 'restitution' ? 'restitution' : 'mise_disposition';
  const sigImages = await getSignatureImagesForBon(deps.fileStore, sig.bon.signatures || []);
  sigImages.collab = null; // la signature du collaborateur n'existe pas encore

  const pdf = await deps.pdfService.generateBonPdf(sig.bon, sigImages, documentType);
  return { pdf, filename: `apercu-${sig.bon.reference}.pdf` };
}
