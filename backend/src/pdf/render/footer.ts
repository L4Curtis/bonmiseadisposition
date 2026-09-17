import { PdfTemplateConfig, substituteVars } from '../pdf-template-config';
import { RenderFonts } from './layout';

// ─── FOOTER ────────────────────────────────────────────────────────────────
// Pied de page : filet de séparation puis texte configurable (mention légale,
// référence). Vérifie l'espace restant avant de dessiner, comme pour les
// signatures, pour éviter un footer livré seul en haut d'une nouvelle page.

export function drawFooterSection(
  doc: PDFKit.PDFDocument,
  config: PdfTemplateConfig,
  templateVars: Record<string, string>,
  fonts: RenderFonts,
  leftX: number,
  pageWidth: number,
): void {
  if (!config.footer.showFooter) return;
  const { colors, fonts: fontSizes } = config;

  const FOOTER_HEIGHT = 30;
  if (doc.y + FOOTER_HEIGHT > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
  doc.y += 12;
  doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).lineWidth(0.5).strokeColor(colors.border).stroke();
  doc.y += 6;
  const footerText = substituteVars(config.footer.footerText, templateVars);
  doc.font(fonts.regular).fontSize(fontSizes.labelSize).fillColor(colors.lightGray);
  doc.text(footerText, leftX, doc.y, { width: pageWidth, align: 'center' });
}
