import { BonForPdf } from '../pdf.service';
import { PdfColorScheme, PdfTemplateConfig } from '../pdf-template-config';
import { formatOptionalText, RenderFonts } from './layout';

// ─── PARTIES (collaborateur / entité) ─────────────────────────────────────────
// Les deux boîtes d'information affichées sous l'en-tête. Avance `doc.y`
// jusque sous la plus haute des deux boîtes.

/** Draws an info box and returns its actual height. */
function drawInfoBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: [string, string][],
  colors: PdfColorScheme,
  fonts: RenderFonts,
): number {
  const LABEL_COL = 70;
  const PAD = 8;
  const valueWidth = width - PAD - LABEL_COL - PAD;
  const ROW_MIN = 14;

  // Measure each row height (value may wrap)
  const rowHeights = rows.map(([, value]) => {
    const h = doc.font(fonts.bold).fontSize(8).heightOfString(value, { width: valueWidth });
    return Math.max(ROW_MIN, h + 4);
  });
  const totalRowsH = rowHeights.reduce((s, h) => s + h, 0);
  const boxHeight = 22 + totalRowsH + 6; // 22 = title area, 6 = bottom padding

  doc.roundedRect(x, y, width, boxHeight, 8).lineWidth(0.5).fillAndStroke(colors.rowAlt, colors.border);

  // Title
  doc.font(fonts.bold).fontSize(7).fillColor(colors.primary);
  doc.text(title.toUpperCase(), x + PAD, y + 7, { width: width - PAD * 2, characterSpacing: 0.4 });
  doc.moveTo(x + PAD, y + 17).lineTo(x + width - PAD, y + 17).lineWidth(0.3).strokeColor(colors.border).stroke();

  // Rows
  let rowY = y + 22;
  rows.forEach(([label, value], i) => {
    doc.font(fonts.regular).fontSize(7).fillColor(colors.gray).text(label, x + PAD, rowY, { width: LABEL_COL });
    doc.font(fonts.bold).fontSize(8).fillColor(colors.dark).text(value, x + PAD + LABEL_COL, rowY, { width: valueWidth });
    rowY += rowHeights[i];
  });

  return boxHeight;
}

/**
 * Dessine les deux boîtes d'information (collaborateur / entité-filiale)
 * côte à côte et avance `doc.y` sous la plus haute des deux.
 */
export function drawPartiesSection(
  doc: PDFKit.PDFDocument,
  bon: BonForPdf,
  config: PdfTemplateConfig,
  civiliteLabel: string,
  fonts: RenderFonts,
  leftX: number,
  pageWidth: number,
): void {
  const { colors } = config;
  const boxWidth = (pageWidth - 14) / 2;
  const infoY = doc.y;

  // Collaborateur box (left)
  const collabRows: [string, string][] = [
    ['Nom complet', `${civiliteLabel} ${formatOptionalText(bon.collaborateur?.displayName)}`],
    ['Email', formatOptionalText(bon.collaborateurEmail)],
    ['Service', formatOptionalText(bon.collaborateur?.department)],
  ];
  let collabBoxH = 0;
  if (config.infoBoxes.showCollaborateur) {
    collabBoxH = drawInfoBox(doc, leftX, infoY, boxWidth, config.infoBoxes.collaborateurTitle, collabRows, colors, fonts);
  }

  // Entité box (right)
  const entityRows: [string, string][] = [
    ['Filiale', bon.filiale?.displayName || bon.filiale?.name || '—'],
  ];
  if (bon.filiale?.address) entityRows.push(['Adresse', bon.filiale.address]);
  if (bon.filiale?.siret) entityRows.push(['SIRET', bon.filiale.siret]);
  entityRows.push(['Créé par', bon.createdBy?.displayName || '—']);
  let entityBoxH = 0;
  if (config.infoBoxes.showEntite) {
    const rightBoxX = leftX + boxWidth + 14;
    entityBoxH = drawInfoBox(doc, rightBoxX, infoY, boxWidth, config.infoBoxes.entiteTitle, entityRows, colors, fonts);
  }

  // Advance Y past the tallest info box
  doc.y = infoY + Math.max(collabBoxH, entityBoxH) + 8;
}
