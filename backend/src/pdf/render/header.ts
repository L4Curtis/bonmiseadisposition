import { Logger } from '@nestjs/common';
import { BonForPdf } from '../pdf.service';
import { PdfTemplateConfig, substituteVars } from '../pdf-template-config';
import { RenderFonts, formatDate } from './layout';

// ─── HEADER ────────────────────────────────────────────────────────────────
// Titre, logo/filiale, référence et dates, filet de séparation. Avance
// `doc.y` jusqu'au bas du filet — les sections suivantes reprennent à partir
// de là.

/**
 * Dessine l'en-tête du document : titre centré, logo (ou nom de filiale à
 * défaut) + sous-titre + référence/dates, puis un filet de séparation.
 */
export function drawHeader(
  doc: PDFKit.PDFDocument,
  bon: BonForPdf,
  config: PdfTemplateConfig,
  templateVars: Record<string, string>,
  fonts: RenderFonts,
  logoBuffer: Buffer | null,
  leftX: number,
  pageWidth: number,
  logger: Logger,
): void {
  const { colors, fonts: fontSizes } = config;
  const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';

  const headerY = doc.y;

  // Row 1: Title (full width, centered, on its own line)
  const titleText = substituteVars(config.header.titleText, templateVars);
  doc.font(fonts.bold).fontSize(fontSizes.titleSize).fillColor(colors.primary);
  doc.text(titleText, leftX, headerY, { width: pageWidth, align: 'center' });
  const afterTitleY = doc.y + 4;

  // Row 2: Logo (left) | Subtitle (center) | Reference + dates (right)
  const row2Y = afterTitleY;

  // Logo (left) — { fit } respecte le ratio d'aspect (jamais de déformation)
  if (config.header.showLogo && logoBuffer) {
    try {
      doc.image(logoBuffer, leftX, row2Y, { fit: [config.header.logoMaxWidth, config.header.logoMaxHeight] });
    } catch (err) {
      logger.warn(`Logo illisible (filiale=${filialeName}, chemin=${bon.filiale?.logoPath ?? '—'}) : ${(err as Error).message}`);
      doc.font(fonts.bold).fontSize(10).fillColor(colors.primary).text(filialeName, leftX, row2Y);
    }
  } else if (config.header.showLogo && filialeName) {
    doc.font(fonts.bold).fontSize(10).fillColor(colors.primary).text(filialeName, leftX, row2Y);
  }

  // Subtitle (center)
  const subtitleText = substituteVars(config.header.subtitleText, templateVars);
  doc.font(fonts.regular).fontSize(fontSizes.subtitleSize).fillColor(colors.gray);
  doc.text(subtitleText, leftX, row2Y + 4, { width: pageWidth, align: 'center' });

  // Reference + dates (right)
  let rightY = row2Y;
  if (config.header.showReference) {
    doc.font(fonts.bold).fontSize(10).fillColor(colors.dark);
    doc.text(bon.reference, leftX, rightY, { width: pageWidth, align: 'right' });
    rightY += 13;
  }
  if (config.header.showDates) {
    doc.font(fonts.regular).fontSize(fontSizes.labelSize).fillColor(colors.gray);
    doc.text(`Émis le : ${formatDate(bon.dateMiseDisposition)}`, leftX, rightY, { width: pageWidth, align: 'right' });
    rightY += 9;
    if (bon.dateRestitution) {
      doc.text(`Restitution : ${formatDate(bon.dateRestitution)}`, leftX, rightY, { width: pageWidth, align: 'right' });
      rightY += 9;
    }
    // Le statut courant n'est PAS imprimé : il est volatil (active→archivé)
    // et casserait le déterminisme du document de preuve.
  }

  // Blue line under header
  const lineY = Math.max(row2Y + config.header.logoMaxHeight + 4, row2Y + 40);
  doc.moveTo(leftX, lineY).lineTo(leftX + pageWidth, lineY).lineWidth(2).strokeColor(colors.primary).stroke();
  doc.y = lineY + 14;
}
