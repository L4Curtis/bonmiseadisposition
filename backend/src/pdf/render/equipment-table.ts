import { BonForPdf } from '../pdf.service';
import { PdfFontsConfig, PdfTemplateConfig, substituteVars } from '../pdf-template-config';
import { PdfDocumentType, RenderFonts, drawSectionTitle } from './layout';

// ─── TABLEAU DES ÉQUIPEMENTS ───────────────────────────────────────────────────
// Filtrage par type de document, calcul des colonnes/largeurs, pagination et
// rendu. `filterEquipmentsForDocumentType` et `computeTableColumns` sont des
// fonctions pures (aucune dépendance à PDFKit) — voir les specs dédiées.

export type PdfEquipment = BonForPdf['equipments'][number];

/** Filtre les équipements affichés selon le type de document. */
export function filterEquipmentsForDocumentType(
  equipments: PdfEquipment[],
  documentType: PdfDocumentType,
  avenantEquipmentIds?: string[],
): PdfEquipment[] {
  if (documentType === 'cloture') {
    return equipments.filter((eq) => eq.notReturned === true);
  }
  if (documentType === 'avenant') {
    const foundIds = avenantEquipmentIds || [];
    return foundIds.length > 0
      ? equipments.filter((eq) => foundIds.includes(eq.id))
      : equipments.filter((eq) => eq.returnedAt && !eq.notReturned);
  }
  return equipments;
}

export interface TableColumnsLayout {
  hasStatutCol: boolean;
  colWidths: number[];
  headers: string[];
  numIdx: number;
  designationIdx: number;
  statutIdx: number;
  lastIdx: number;
}

/**
 * Calcule les colonnes du tableau (largeurs, en-têtes, index utiles) selon le
 * type de document et si la colonne « # » est affichée. Fonction pure —
 * aucune dépendance au PDFDocument.
 */
export function computeTableColumns(
  documentType: PdfDocumentType,
  pageWidth: number,
  showRowNum: boolean,
): TableColumnsLayout {
  const hasStatutCol = documentType === 'restitution' || documentType === 'cloture';
  // showRowNumbers (config admin) : la colonne « # » est optionnelle — quand
  // elle est masquée, les autres colonnes récupèrent proportionnellement sa
  // largeur au lieu de laisser un vide.
  const NUM_COL_WIDTH = hasStatutCol ? 24 : 28;
  const availableWidth = showRowNum ? pageWidth - NUM_COL_WIDTH : pageWidth;

  let baseWidths: number[];
  let baseHeaders: string[];
  if (hasStatutCol) {
    const w1 = availableWidth * 0.24;
    const w2 = availableWidth * 0.16;
    const w3 = availableWidth * 0.16;
    const w4 = availableWidth * 0.20;
    const w5 = availableWidth - w1 - w2 - w3 - w4;
    baseWidths = [w1, w2, w3, w4, w5];
    baseHeaders = ['Désignation', 'N° Série', 'N° Inventaire', 'Statut', 'Remarques'];
  } else {
    const w1 = availableWidth * 0.32;
    const w2 = availableWidth * 0.22;
    const w3 = availableWidth * 0.22;
    const w4 = availableWidth - w1 - w2 - w3;
    baseWidths = [w1, w2, w3, w4];
    baseHeaders = ['Désignation', 'N° Série', 'N° Inventaire', 'Remarques'];
  }
  const colWidths = showRowNum ? [NUM_COL_WIDTH, ...baseWidths] : baseWidths;
  const headers = showRowNum ? ['#', ...baseHeaders] : baseHeaders;
  const numIdx = showRowNum ? 0 : -1;
  const designationIdx = showRowNum ? 1 : 0;
  const statutIdx = hasStatutCol ? (showRowNum ? 4 : 3) : -1;
  const lastIdx = colWidths.length - 1;

  return { hasStatutCol, colWidths, headers, numIdx, designationIdx, statutIdx, lastIdx };
}

/** Bandeau d'information spécifique à l'avenant, juste avant le tableau. */
export function drawAvenantNote(
  doc: PDFKit.PDFDocument,
  fonts: PdfFontsConfig,
  fontNames: RenderFonts,
  leftX: number,
  pageWidth: number,
): void {
  doc.y += 6;
  const noteY = doc.y;
  doc.rect(leftX, noteY, pageWidth, 28).fill('#f0fdf4').stroke();
  doc.font(fontNames.bold).fontSize(fonts.bodySize).fillColor('#15803d');
  doc.text(
    'Ce document atteste que les équipements ci-dessous, précédemment déclarés non restitués,',
    leftX + 8, noteY + 6, { width: pageWidth - 16 },
  );
  doc.font(fontNames.regular).fontSize(fonts.bodySize).fillColor('#15803d');
  doc.text(
    'ont été retrouvés et récupérés par le service informatique. Le procès-verbal de clôture initial reste valide.',
    leftX + 8, noteY + 16, { width: pageWidth - 16 },
  );
  doc.y = noteY + 34;
}

/**
 * Dessine le titre de section puis le tableau des équipements (en-tête,
 * lignes, pastille de statut, pagination). Avance `doc.y` jusqu'au bas de la
 * dernière ligne (ou du message « aucun équipement »).
 */
export function drawEquipmentTable(
  doc: PDFKit.PDFDocument,
  bon: BonForPdf,
  documentType: PdfDocumentType,
  config: PdfTemplateConfig,
  templateVars: Record<string, string>,
  fontNames: RenderFonts,
  leftX: number,
  pageWidth: number,
): void {
  const { colors, fonts } = config;

  doc.y += 8;
  const tableSectionLabel = substituteVars(config.table.sectionTitle, templateVars);
  drawSectionTitle(doc, leftX, tableSectionLabel, pageWidth, colors, fontNames);
  doc.y += 4;

  const allEquipments: PdfEquipment[] = bon.equipments || [];
  const equipments = filterEquipmentsForDocumentType(allEquipments, documentType, bon._avenantEquipmentIds);

  const showRowNum = config.table.showRowNumbers;
  const { hasStatutCol, colWidths, headers, numIdx, designationIdx, statutIdx, lastIdx } =
    computeTableColumns(documentType, pageWidth, showRowNum);

  const drawTableHeaderRow = (y: number): void => {
    doc.rect(leftX, y, pageWidth, 18).fill(colors.headerBg);
    doc.font(fontNames.bold).fontSize(fonts.tableHeaderSize).fillColor('#ffffff');
    let hColX = leftX + 4;
    headers.forEach((h, hi) => {
      doc.text(h.toUpperCase(), hColX, y + 5, { width: colWidths[hi] - 8 });
      hColX += colWidths[hi];
    });
  };

  // Table header
  const tableY = doc.y;
  drawTableHeaderRow(tableY);
  doc.y = tableY + 18;

  // Table rows
  const ROW_HEIGHT_MIN = 16;
  const ROW_PADDING_V = 8; // haut + bas autour du texte (cohérent avec l'offset rowY+4 existant)
  const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom;

  if (equipments.length === 0) {
    doc.font(fontNames.regular).fontSize(fonts.tableBodySize).fillColor(colors.lightGray);
    doc.text(config.table.emptyMessage, leftX, doc.y + 6, { width: pageWidth, align: 'center' });
    doc.y += 24;
    return;
  }

  equipments.forEach((eq, i) => {
    const label = eq.catalogItem
      ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
      : eq.customLabel || '—';

    // Statut (restitution/clôture) : pastille colorée + libellé propre
    // (remplace les anciens placeholders ASCII V / X / ...).
    const statut = hasStatutCol
      ? (eq.returnedAt
          ? { label: 'Rendu', color: '#16a34a' }
          : eq.notReturned
            ? { label: 'Non rendu', color: '#dc2626' }
            : { label: 'En attente', color: colors.lightGray })
      : null;
    // Le motif de non-restitution rejoint la colonne Remarques (plus lisible)
    const remarks = hasStatutCol && eq.notReturned && eq.notReturnedReason
      ? (eq.notes ? `${eq.notes} — ${eq.notReturnedReason}` : eq.notReturnedReason)
      : (eq.notes || '');

    const rowValues: (string | null)[] = [];
    if (showRowNum) rowValues.push(`${i + 1}`);
    rowValues.push(label, eq.serialNumber || '—', eq.inventoryNumber || '—');
    if (hasStatutCol) rowValues.push(null); // Statut : dessiné à part (pastille), pas de wrap à mesurer
    rowValues.push(remarks);

    // Hauteur de ligne nécessaire : une désignation ou une remarque longue
    // ne doit plus déborder sur les colonnes voisines (N° série / inventaire) —
    // on mesure chaque cellule à sa largeur réelle et on prend le maximum,
    // avec un plancher pour ne pas resserrer les lignes courtes.
    let rowHeight = ROW_HEIGHT_MIN;
    rowValues.forEach((val, ci) => {
      if (ci === statutIdx) return; // pastille : hauteur fixe, une ligne
      const font = ci === designationIdx ? fontNames.bold : fontNames.regular;
      doc.font(font).fontSize(fonts.tableBodySize);
      const h = doc.heightOfString(val ?? '', { width: colWidths[ci] - 8 }) + ROW_PADDING_V;
      if (h > rowHeight) rowHeight = h;
    });

    // Saut de page si la ligne (avec sa hauteur réelle) ne tient pas dans
    // l'espace restant — réutilise la même marge de sécurité (40) que le
    // reste du document pour laisser la place aux signatures/certificat.
    if (doc.y + rowHeight > PAGE_BOTTOM - 40) {
      doc.addPage();
      const newHeaderY = doc.y;
      drawTableHeaderRow(newHeaderY);
      doc.y = newHeaderY + 18;
    }

    const rowY = doc.y;

    // Alternate row background
    if (i % 2 === 1) {
      doc.rect(leftX, rowY, pageWidth, rowHeight).fill(colors.rowAlt);
    }

    let colX = leftX + 4;
    rowValues.forEach((val, ci) => {
      if (ci === statutIdx && statut) {
        doc.circle(colX + 3, rowY + rowHeight / 2, 2.2).fillColor(statut.color).fill();
        doc.font(fontNames.bold).fontSize(fonts.tableBodySize).fillColor(statut.color);
        doc.text(statut.label, colX + 9, rowY + 4, { width: colWidths[ci] - 13, lineBreak: true });
      } else {
        doc.font(ci === designationIdx ? fontNames.bold : fontNames.regular).fontSize(fonts.tableBodySize);
        doc.fillColor(ci === numIdx || ci === lastIdx ? colors.gray : colors.dark);
        doc.text(val ?? '', colX, rowY + 4, { width: colWidths[ci] - 8, lineBreak: true });
      }
      colX += colWidths[ci];
    });

    // Row bottom border
    doc.moveTo(leftX, rowY + rowHeight).lineTo(leftX + pageWidth, rowY + rowHeight)
      .lineWidth(0.5).strokeColor(colors.border).stroke();
    doc.y = rowY + rowHeight;
  });
}
