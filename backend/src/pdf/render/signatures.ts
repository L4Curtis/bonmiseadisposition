import { Logger } from '@nestjs/common';
import { PdfColorScheme, PdfTemplateConfig } from '../pdf-template-config';
import { RenderFonts, drawSectionTitle } from './layout';
import { SignatureBoxModel, SignaturesModel } from './signature-model';

// ─── SIGNATURES ────────────────────────────────────────────────────────────────
// Cases de signature (IT + collaborateur, ou IT seule pour l'avenant) et cachet
// de la filiale apposé sous la case IT. Le contenu des cases est calculé par
// signature-model.ts ; ce module ne fait que le dessiner.

/** Ancien nom du contenu d'une case, gardé pour les appelants. */
export type SignatureBoxOptions = SignatureBoxModel;

/** Callback vers la méthode d'instance PdfService.drawSignatureBox — permet
 *  aux specs d'espionner cette méthode tout en gardant le rendu ici. */
export type DrawSignatureBoxFn = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  opts: SignatureBoxModel,
  colors: PdfColorScheme,
) => void;

/** Hauteur réelle d'une case de signature (cadre dessiné par renderSignatureBox). */
export const SIGNATURE_BOX_HEIGHT = 145;

export function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const matches = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!matches) return null;
    return Buffer.from(matches[1], 'base64');
  } catch {
    return null;
  }
}

function drawPlaceholder(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: PdfColorScheme,
  fonts: RenderFonts,
): void {
  doc.font(fonts.regular).fontSize(7).fillColor(colors.gray).text(text, x + 8, y + 8, {
    width: width - 16,
    height: height - 12,
    align: 'center',
    ellipsis: true,
  });
}

/** Rectangle en points PDF. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Marge entre le tracé et le bord de sa zone : une signature qui monte tout
 *  en haut du pavé ne touche ni le cadre ni la mention au-dessus. */
export const SIGNATURE_IMAGE_MARGIN = 6;

/** Zone de signature d'une case : sous la mention (deux lignes comprises),
 *  au-dessus de la ligne de date. */
export function signatureZone(x: number, y: number, width: number): FrameRect {
  return { x: x + 10, y: y + 52, width: width - 20, height: 66 };
}

/** Cadre de l'image du tracé : la zone, moins la marge de chaque côté. */
export function signatureImageFrame(x: number, y: number, width: number): FrameRect {
  const zone = signatureZone(x, y, width);
  return {
    x: zone.x + SIGNATURE_IMAGE_MARGIN,
    y: zone.y + SIGNATURE_IMAGE_MARGIN,
    width: zone.width - 2 * SIGNATURE_IMAGE_MARGIN,
    height: zone.height - 2 * SIGNATURE_IMAGE_MARGIN,
  };
}

/** Pose l'image du tracé dans son cadre (proportions gardées), découpée à la
 *  zone : même une image mal formée ne déborde jamais. */
function drawSignatureImage(doc: PDFKit.PDFDocument, image: Buffer, zone: FrameRect, frame: FrameRect): void {
  doc.save();
  doc.roundedRect(zone.x, zone.y, zone.width, zone.height, 6).clip();
  try {
    doc.image(image, frame.x, frame.y, { fit: [frame.width, frame.height], align: 'center', valign: 'center' });
  } finally {
    doc.restore();
  }
}

/** Corps du rendu d'une case signature (cadre, identité, mention, image ou
 *  texte de remplacement, date). Fonction pure PDFKit. */
export function renderSignatureBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  opts: SignatureBoxModel,
  colors: PdfColorScheme,
  fonts: RenderFonts,
): void {
  doc.roundedRect(x, y, width, SIGNATURE_BOX_HEIGHT, 8).lineWidth(0.5).strokeColor(colors.border).stroke();

  doc.font(fonts.bold).fontSize(7).fillColor(colors.primary).text(opts.title.toUpperCase(), x + 10, y + 9, { width: width - 20, characterSpacing: 0.4 });
  doc.font(fonts.bold).fontSize(9).fillColor(colors.dark).text(opts.name, x + 10, y + 21, { width: width - 20 });
  doc.font(fonts.regular).fontSize(6.5).fillColor(colors.gray).text(opts.mention, x + 10, y + 33, { width: width - 20 });

  // Zone de signature (fond fixe : rendu déterministe)
  const zone = signatureZone(x, y, width);
  doc.roundedRect(zone.x, zone.y, zone.width, zone.height, 6).fillColor('#FAF9F7').fill();
  doc.roundedRect(zone.x, zone.y, zone.width, zone.height, 6).lineWidth(0.5).strokeColor(colors.border).stroke();

  const imgBuffer = opts.signatureImage ? dataUrlToBuffer(opts.signatureImage) : null;
  let drawn = false;
  if (imgBuffer) {
    try {
      drawSignatureImage(doc, imgBuffer, zone, signatureImageFrame(x, y, width));
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    if (opts.placeholder) {
      drawPlaceholder(doc, opts.placeholder, zone.x, zone.y, zone.width, zone.height, colors, fonts);
    } else {
      doc.font(fonts.regular).fontSize(7).fillColor(colors.lightGray).text('Signature', x + 8, zone.y + 20, { width: width - 16, align: 'center' });
    }
  }

  const dateLine = opts.detail ? `Date : ${opts.date} — ${opts.detail}` : `Date : ${opts.date}`;
  doc.font(fonts.regular).fontSize(7).fillColor(colors.gray).text(dateLine, x + 8, y + 124, { width: width - 16, height: 18, ellipsis: true });
}

/**
 * Dessine la section SIGNATURES : saut de page si nécessaire, une ou deux
 * cases, puis le cachet de la filiale sous la case IT.
 */
export function drawSignaturesSection(
  doc: PDFKit.PDFDocument,
  model: SignaturesModel,
  config: PdfTemplateConfig,
  fontNames: RenderFonts,
  leftX: number,
  pageWidth: number,
  stampBuffer: Buffer | null,
  logger: Logger,
  drawBox: DrawSignatureBoxFn,
): void {
  if (!config.signatures.showSignatures) return;
  const { colors } = config;

  if (doc.y > doc.page.height - 220) {
    doc.addPage();
  }

  doc.y += 8;
  drawSectionTitle(doc, leftX, 'SIGNATURES', pageWidth, colors, fontNames);
  doc.y += 6;

  // Point de départ commun aux deux mises en page, capturé AVANT que doc.y
  // n'avance : référence fixe pour placer le cachet sous le bas RÉEL de la
  // case (et non sous doc.y, qui peut avoir été avancé de moins).
  const signatureBoxTopY = doc.y;

  if (!model.collab) {
    drawBox(doc, leftX, signatureBoxTopY, pageWidth, model.it, colors);
    doc.y += 155;
  } else {
    const sigBoxWidth = (pageWidth - 24) / 2;
    drawBox(doc, leftX, signatureBoxTopY, sigBoxWidth, model.it, colors);
    drawBox(doc, leftX + sigBoxWidth + 24, signatureBoxTopY, sigBoxWidth, model.collab, colors);
    doc.y = signatureBoxTopY + 130;
  }

  // ─── CACHET DE LA FILIALE ───────────────────────────────────────────────
  // Apposé sous la case « signature IT », sans jamais la recouvrir. { fit }
  // respecte le ratio d'aspect ; aucune date apposée (rendu déterministe).
  if (stampBuffer) {
    const STAMP_MARGIN_TOP = 10;
    const stampMaxW = 70;
    const stampMaxH = 40;
    const stampY = signatureBoxTopY + SIGNATURE_BOX_HEIGHT + STAMP_MARGIN_TOP;
    try {
      doc.image(stampBuffer, leftX, stampY, { fit: [stampMaxW, stampMaxH] });
      // Ne jamais reculer le curseur.
      doc.y = Math.max(doc.y, stampY + stampMaxH + 6);
    } catch (err) {
      logger.warn(`Cachet de la filiale illisible : ${(err as Error).message}`);
    }
  }
}
