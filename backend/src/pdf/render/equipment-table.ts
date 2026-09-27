import type { BonForPdf } from '../pdf-types';
import { PdfFontsConfig, PdfTemplateConfig, substituteVars } from '../pdf-template-config';
import { PdfDocumentType, RenderFonts, drawSectionTitle, formatDate } from './layout';
import type { RestitutionGroups } from './restitution-scope';

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
    'ont été retrouvés et récupérés par l’équipe informatique. Le PV de non-restitution initial reste valide.',
    leftX + 8, noteY + 16, { width: pageWidth - 16 },
  );
  doc.y = noteY + 34;
}

/** Statut affiché dans la colonne « Statut » d'une ligne (pastille + libellé). */
export interface RowStatus {
  label: string;
  color: string;
}

/** Tout ce que le dessin d'un tableau partage. */
interface TableContext {
  doc: PDFKit.PDFDocument;
  config: PdfTemplateConfig;
  fontNames: RenderFonts;
  leftX: number;
  pageWidth: number;
  layout: TableColumnsLayout;
}

const RETURNED_COLOR = '#16a34a';
const NOT_RETURNED_COLOR = '#dc2626';

/** Statut d'un équipement hors restitution découpée (PV, remise, avenant). */
function defaultStatus(eq: PdfEquipment, grayColor: string): RowStatus {
  if (eq.returnedAt) return { label: 'Restitué', color: RETURNED_COLOR };
  if (eq.notReturned) return { label: 'Non restitué', color: NOT_RETURNED_COLOR };
  return { label: 'Reste chez le collaborateur', color: grayColor };
}

/**
 * Dessine le titre de section puis le(s) tableau(x) des équipements. Un
 * document de restitution est découpé (voir restitution-scope.ts) : rendus
 * dans cette restitution, déjà rendus avant, et restés chez le collaborateur.
 * Avance `doc.y` jusqu'au bas du dernier tableau.
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
  restitution?: RestitutionGroups,
): void {
  const ctx: TableContext = {
    doc, config, fontNames, leftX, pageWidth,
    layout: computeTableColumns(documentType, pageWidth, config.table.showRowNumbers),
  };
  doc.y += 8;
  drawSectionTitle(doc, leftX, substituteVars(config.table.sectionTitle, templateVars), pageWidth, config.colors, fontNames);
  doc.y += 4;

  if (documentType === 'restitution' && restitution) {
    drawRestitutionGroups(ctx, restitution);
    return;
  }
  const equipments = filterEquipmentsForDocumentType(bon.equipments || [], documentType, bon._avenantEquipmentIds);
  drawRows(ctx, equipments, (eq) => defaultStatus(eq, config.colors.lightGray), config.table.emptyMessage);
}

function drawRestitutionGroups(ctx: TableContext, groups: RestitutionGroups): void {
  const { config } = ctx;
  drawRows(ctx, groups.returnedNow, () => ({ label: 'Restitué', color: RETURNED_COLOR }), 'Aucun équipement rendu dans cette restitution');
  if (groups.returnedBefore.length > 0) {
    drawSubheading(ctx, 'DÉJÀ RESTITUÉS LORS D’UNE RESTITUTION PRÉCÉDENTE');
    drawRows(ctx, groups.returnedBefore, (eq) => ({
      label: `Restitué le ${formatDate(eq.returnedAt ?? null)}`,
      color: config.colors.gray,
    }), '');
  }
  if (groups.stillHeld.length > 0) {
    drawSubheading(ctx, 'RESTENT CHEZ LE COLLABORATEUR');
    drawRows(ctx, groups.stillHeld, (eq) => eq.notReturned
      ? { label: 'Non restitué', color: NOT_RETURNED_COLOR }
      : { label: 'Reste chez le collaborateur', color: config.colors.lightGray }, '');
  }
}

function drawSubheading(ctx: TableContext, label: string): void {
  ctx.doc.y += 10;
  drawSectionTitle(ctx.doc, ctx.leftX, label, ctx.pageWidth, ctx.config.colors, ctx.fontNames);
  ctx.doc.y += 4;
}

function drawHeaderRow(ctx: TableContext, y: number): void {
  const { doc, config, fontNames, leftX, pageWidth, layout } = ctx;
  doc.rect(leftX, y, pageWidth, 18).fill(config.colors.headerBg);
  doc.font(fontNames.bold).fontSize(config.fonts.tableHeaderSize).fillColor('#ffffff');
  layout.headers.reduce((x, h, hi) => {
    doc.text(h.toUpperCase(), x, y + 5, { width: layout.colWidths[hi] - 8 });
    return x + layout.colWidths[hi];
  }, leftX + 4);
}

/** Valeurs d'une ligne ; la cellule « Statut » (pastille) vaut `null`. */
function rowValues(eq: PdfEquipment, index: number, layout: TableColumnsLayout): (string | null)[] {
  const label = eq.catalogItem ? `${eq.catalogItem.brand} ${eq.catalogItem.model}` : eq.customLabel || '—';
  // Le motif de non-restitution rejoint la colonne Remarques (plus lisible).
  const remarks = layout.hasStatutCol && eq.notReturned && eq.notReturnedReason
    ? (eq.notes ? `${eq.notes} — ${eq.notReturnedReason}` : eq.notReturnedReason)
    : (eq.notes || '');
  return [
    ...(layout.numIdx === 0 ? [`${index + 1}`] : []),
    label, eq.serialNumber || '—', eq.inventoryNumber || '—',
    ...(layout.hasStatutCol ? [null] : []),
    remarks,
  ];
}

/** Hauteur d'une ligne : une désignation, une remarque ou un statut long
 *  (« Reste chez le collaborateur », « Restitué le … ») ne déborde jamais sur
 *  la ligne suivante, avec un plancher pour les lignes courtes. */
function rowHeightOf(ctx: TableContext, values: (string | null)[], status: RowStatus): number {
  const { doc, config, fontNames, layout } = ctx;
  return values.reduce<number>((height, val, ci) => {
    const isStatus = ci === layout.statutIdx;
    doc.font(isStatus || ci === layout.designationIdx ? fontNames.bold : fontNames.regular).fontSize(config.fonts.tableBodySize);
    const text = isStatus ? status.label : val ?? '';
    const width = layout.colWidths[ci] - (isStatus ? 13 : 8);
    return Math.max(height, doc.heightOfString(text, { width }) + 8);
  }, 16);
}

function drawRows(
  ctx: TableContext,
  equipments: readonly PdfEquipment[],
  statusOf: (eq: PdfEquipment) => RowStatus,
  emptyMessage: string,
): void {
  const { doc, config, fontNames, leftX, pageWidth } = ctx;
  if (equipments.length === 0) {
    if (!emptyMessage) return;
    doc.font(fontNames.regular).fontSize(config.fonts.tableBodySize).fillColor(config.colors.lightGray);
    doc.text(emptyMessage, leftX, doc.y + 6, { width: pageWidth, align: 'center' });
    doc.y += 24;
    return;
  }
  const headerY = doc.y;
  drawHeaderRow(ctx, headerY);
  doc.y = headerY + 18;
  equipments.forEach((eq, i) => drawRow(ctx, eq, i, statusOf(eq)));
}

function drawRow(ctx: TableContext, eq: PdfEquipment, index: number, status: RowStatus): void {
  const { doc, config, fontNames, leftX, pageWidth, layout } = ctx;
  const values = rowValues(eq, index, layout);
  const rowHeight = rowHeightOf(ctx, values, status);
  // Saut de page si la ligne ne tient pas : même marge de sécurité (40) que le
  // reste du document, pour laisser la place aux signatures et au certificat.
  if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 40) {
    doc.addPage();
    const headerY = doc.y;
    drawHeaderRow(ctx, headerY);
    doc.y = headerY + 18;
  }
  const rowY = doc.y;
  if (index % 2 === 1) doc.rect(leftX, rowY, pageWidth, rowHeight).fill(config.colors.rowAlt);
  values.reduce((colX, val, ci) => {
    const width = layout.colWidths[ci];
    if (ci === layout.statutIdx) {
      // Pastille alignée sur la première ligne du libellé (jamais décalée
      // sous le texte quand la ligne est haute).
      doc.circle(colX + 3, rowY + 7.5, 2.2).fillColor(status.color).fill();
      doc.font(fontNames.bold).fontSize(config.fonts.tableBodySize).fillColor(status.color);
      doc.text(status.label, colX + 9, rowY + 4, { width: width - 13, lineBreak: true });
    } else {
      doc.font(ci === layout.designationIdx ? fontNames.bold : fontNames.regular).fontSize(config.fonts.tableBodySize);
      doc.fillColor(ci === layout.numIdx || ci === layout.lastIdx ? config.colors.gray : config.colors.dark);
      doc.text(val ?? '', colX, rowY + 4, { width: width - 8, lineBreak: true });
    }
    return colX + width;
  }, leftX + 4);
  doc.moveTo(leftX, rowY + rowHeight).lineTo(leftX + pageWidth, rowY + rowHeight)
    .lineWidth(0.5).strokeColor(config.colors.border).stroke();
  doc.y = rowY + rowHeight;
}
