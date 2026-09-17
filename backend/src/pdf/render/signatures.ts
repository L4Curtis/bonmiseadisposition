import { Logger } from '@nestjs/common';
import { BonForPdf, SigImages } from '../pdf.service';
import { PdfColorScheme, PdfTemplateConfig } from '../pdf-template-config';
import { PdfDocumentType, RenderFonts, drawSectionTitle, formatDate } from './layout';

// ─── SIGNATURES ────────────────────────────────────────────────────────────────
// Cases de signature (IT / collaborateur ou IT seul pour l'avenant) et cachet
// de filiale apposé sous la case IT.

export interface SignatureBoxOptions {
  title: string;
  name: string;
  mention: string;
  signatureImage: string | null;
  date: string;
}

/** Callback vers la méthode d'instance PdfService.drawSignatureBox — permet
 *  aux specs existantes de continuer à espionner cette méthode (comportement
 *  inchangé) tout en gardant le rendu lui-même dans ce module. */
export type DrawSignatureBoxFn = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  opts: SignatureBoxOptions,
  colors: PdfColorScheme,
) => void;

export function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const matches = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!matches) return null;
    return Buffer.from(matches[1], 'base64');
  } catch {
    return null;
  }
}

/** Corps du rendu d'une case signature (cadre, identité, mention, image ou
 *  placeholder, date). Fonction pure PDFKit : ne dépend d'aucun état
 *  d'instance, les noms de police sont injectés explicitement. */
export function renderSignatureBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  opts: SignatureBoxOptions,
  colors: PdfColorScheme,
  fonts: RenderFonts,
): void {
  doc.roundedRect(x, y, width, 145, 8).lineWidth(0.5).strokeColor(colors.border).stroke();

  doc.font(fonts.bold).fontSize(7).fillColor(colors.primary).text(opts.title.toUpperCase(), x + 10, y + 9, { width: width - 20, characterSpacing: 0.4 });
  doc.font(fonts.bold).fontSize(9).fillColor(colors.dark).text(opts.name, x + 10, y + 21, { width: width - 20 });
  doc.font(fonts.regular).fontSize(6.5).fillColor(colors.gray).text(opts.mention, x + 10, y + 33, { width: width - 20 });

  // Signature zone
  const sigZoneY = y + 48;
  const sigZoneH = 70;
  // Light background fill for the signature area (couleur fixe : déterministe)
  doc.roundedRect(x + 10, sigZoneY, width - 20, sigZoneH, 6).fillColor('#FAF9F7').fill();
  doc.roundedRect(x + 10, sigZoneY, width - 20, sigZoneH, 6).lineWidth(0.5).strokeColor(colors.border).stroke();

  if (opts.signatureImage) {
    try {
      const imgBuffer = dataUrlToBuffer(opts.signatureImage);
      if (imgBuffer) {
        doc.image(imgBuffer, x + 10, sigZoneY + 2, { fit: [width - 20, sigZoneH - 4], align: 'center', valign: 'center' });
      }
    } catch {
      // Fallback: placeholder text
      doc.font(fonts.regular).fontSize(7).fillColor(colors.lightGray).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
    }
  } else {
    doc.font(fonts.regular).fontSize(7).fillColor(colors.lightGray).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
  }

  doc.font(fonts.regular).fontSize(7).fillColor(colors.gray).text(`Date : ${opts.date}`, x + 8, y + 128, { width: width - 16 });
}

/**
 * Dessine la section SIGNATURES complète : saut de page si nécessaire, une
 * ou deux cases (IT / collaborateur ou IT seul pour l'avenant) puis le
 * cachet de filiale sous la case IT.
 */
export function drawSignaturesSection(
  doc: PDFKit.PDFDocument,
  bon: BonForPdf,
  sigImages: SigImages,
  documentType: PdfDocumentType,
  config: PdfTemplateConfig,
  civiliteLabel: string,
  fontNames: RenderFonts,
  leftX: number,
  pageWidth: number,
  stampBuffer: Buffer | null,
  logger: Logger,
  drawBox: DrawSignatureBoxFn,
): void {
  if (!config.signatures.showSignatures) return;
  const { colors } = config;

  // Check if we need a new page for signatures
  if (doc.y > doc.page.height - 220) {
    doc.addPage();
  }

  doc.y += 8;
  drawSectionTitle(doc, leftX, 'SIGNATURES', pageWidth, colors, fontNames);
  doc.y += 6;

  // Signature dates — use the latest it_cachet
  type PdfSignature = NonNullable<BonForPdf['signatures']>[number];
  const allSigs: PdfSignature[] = bon.signatures || [];
  const itSigs = allSigs.filter((s) => s.signed && s.type === 'it_cachet' && s.signatureImagePath);
  const itSig = itSigs.length > 0 ? itSigs[itSigs.length - 1] : null; // latest
  const collabSig = allSigs.find((s) => s.signed && s.signatureImagePath && s.type !== 'it_cachet');
  const itDate = itSig?.signedAt ? formatDate(itSig.signedAt) : '_______________';
  const collabDate = collabSig?.signedAt ? formatDate(collabSig.signedAt) : '_______________';

  // Hauteur RÉELLE d'une case signature (cf. renderSignatureBox : hauteur
  // fixe passée à roundedRect). Le cachet doit toujours démarrer sous ce
  // bas de case, jamais en fonction de la valeur — parfois plus petite —
  // à laquelle le curseur `doc.y` est ensuite avancé (avant correctif, la
  // case à deux colonnes avançait doc.y de 130 seulement, soit 15pt
  // AVANT le bas réel de la case, faisant chevaucher le cachet sur la
  // ligne « Date : … »).
  const SIGNATURE_BOX_HEIGHT = 145;
  // Point de départ commun aux deux mises en page (case unique avenant ou
  // case IT + case collaborateur), capturé AVANT que doc.y n'avance —
  // sert de référence fixe pour positionner le cachet.
  const signatureBoxTopY = doc.y;

  if (documentType === 'avenant') {
    // IT signature only — full width
    drawBox(doc, leftX, doc.y, pageWidth, {
      title: config.signatures.itTitle,
      name: bon.createdBy?.displayName || '—',
      mention: config.signatures.itMention,
      signatureImage: sigImages.it,
      date: itDate,
    }, colors);
    doc.y += 155;
  } else {
    const sigBoxWidth = (pageWidth - 24) / 2;
    const sigY = doc.y;

    // IT signature box
    drawBox(doc, leftX, sigY, sigBoxWidth, {
      title: config.signatures.itTitle,
      name: bon.createdBy?.displayName || '—',
      mention: config.signatures.itMention,
      signatureImage: sigImages.it,
      date: itDate,
    }, colors);

    // Collaborateur signature box. En clôture unilatérale, la mention
    // « constaté sans signature » remplace la mention standard.
    drawBox(doc, leftX + sigBoxWidth + 24, sigY, sigBoxWidth, {
      title: config.signatures.collabTitle,
      name: `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`,
      mention: bon._unilateralNote ?? config.signatures.collabMention,
      signatureImage: bon._unilateralNote ? null : sigImages.collab,
      date: collabDate,
    }, colors);

    doc.y = sigY + 130;
  }

  // ─── CACHET DE FILIALE ──────────────────────────────────────────────────
  // Apposé sous la case « signature IT », sans jamais la recouvrir. Ancré
  // sur signatureBoxTopY + SIGNATURE_BOX_HEIGHT (bas RÉEL de la case),
  // pas sur doc.y (qui peut avoir été avancé de moins que la hauteur de
  // la case — cf. commentaire ci-dessus). Rendu déterministe : { fit }
  // respecte le ratio d'aspect, aucune date apposée.
  if (stampBuffer) {
    const STAMP_MARGIN_TOP = 10;
    const stampMaxW = 70;
    const stampMaxH = 40;
    const stampY = signatureBoxTopY + SIGNATURE_BOX_HEIGHT + STAMP_MARGIN_TOP;
    try {
      doc.image(stampBuffer, leftX, stampY, { fit: [stampMaxW, stampMaxH] });
      // Ne jamais reculer le curseur : la case (ou son avance normale)
      // peut déjà avoir poussé doc.y plus bas que le cachet.
      doc.y = Math.max(doc.y, stampY + stampMaxH + 6);
    } catch (err) {
      logger.warn(`Cachet de filiale illisible (${bon.filiale?.stampPath ?? '—'}) : ${(err as Error).message}`);
    }
  }
}
