import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABELS } from '../common/status-labels';
import { PdfSnapshotType } from '../common/types';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfTemplateConfig, substituteVars } from './pdf-template-config';

export interface SigImages {
  it: string | null;
  collab: string | null;
}

/** Shape of the bon object expected by PDF generation methods. */
export interface BonForPdf {
  id: string;
  reference: string;
  civilite: string;
  status: string;
  dateMiseDisposition: Date | string;
  dateRestitution?: Date | string | null;
  notes?: string | null;
  filiale: {
    displayName?: string;
    name?: string;
    logoPath?: string | null;
    address?: string | null;
    siret?: string | null;
  };
  collaborateur: {
    displayName?: string;
    department?: string | null;
  };
  collaborateurEmail?: string;
  createdBy?: {
    displayName?: string;
  };
  equipments: Array<{
    id: string;
    catalogItem?: { brand: string; model: string } | null;
    customLabel?: string | null;
    serialNumber?: string | null;
    inventoryNumber?: string | null;
    notes?: string | null;
    returnedAt?: Date | string | null;
    notReturned?: boolean;
    notReturnedReason?: string | null;
  }>;
  signatures?: Array<{
    type: string;
    signed: boolean;
    signedAt?: Date | string | null;
    signatureImagePath?: string | null;
  }>;
  /** Used by avenant generation to filter equipment */
  _avenantEquipmentIds?: string[];
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfTemplatesService: PdfTemplatesService,
  ) {}

  /**
   * Génère le PDF d'un bon et le sauvegarde en base (snapshot immuable).
   * snapshotType = PdfSnapshotType enum value
   */
  async generateAndSave(
    bon: BonForPdf,
    snapshotType: string, // PdfSnapshotType enum value
    sigImages: SigImages,
    filename: string,
  ): Promise<Buffer> {
    // Determine document type from snapshot type
    const documentType = this.getDocumentType(snapshotType);
    const pdf = await this.renderPdf(bon, sigImages, documentType);

    // Guard: reject oversized PDFs (10 MB max)
    const MAX_PDF_SIZE = 10 * 1024 * 1024;
    if (pdf.length > MAX_PDF_SIZE) {
      throw new Error(`PDF trop volumineux (${(pdf.length / 1024 / 1024).toFixed(1)} MB > 10 MB) pour le bon ${bon.reference}`);
    }

    // Upsert into PdfSnapshot table
    await this.prisma.pdfSnapshot.upsert({
      where: { bonId_type: { bonId: bon.id, type: snapshotType as PdfSnapshotType } },
      update: { data: pdf, filename },
      create: { bonId: bon.id, type: snapshotType as PdfSnapshotType, data: pdf, filename },
    });

    this.logger.log(`PDF snapshot ${snapshotType} sauvegardé pour le bon ${bon.reference}`);
    return pdf;
  }

  getDocumentType(snapshotType: string): 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' {
    if (snapshotType.includes('avenant')) return 'avenant';
    if (snapshotType.includes('restitution')) return 'restitution';
    if (snapshotType.includes('cloture')) return 'cloture';
    return 'mise_disposition';
  }

  /** Génère le PDF sans le sauvegarder (appel à la demande). */
  async generateBonPdf(
    bon: BonForPdf,
    sigImages: SigImages = { it: null, collab: null },
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' = 'mise_disposition',
    configOverride?: PdfTemplateConfig,
  ): Promise<Buffer> {
    return this.renderPdf(bon, sigImages, documentType, configOverride);
  }

  // ─── Rendering (PDFKit) ────────────────────────────────────────────────────

  private async renderPdf(
    bon: BonForPdf,
    sigImages: SigImages,
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' = 'mise_disposition',
    configOverride?: PdfTemplateConfig,
  ): Promise<Buffer> {
    // Load template config: override > custom from DB > default
    const config = configOverride ?? await this.pdfTemplatesService.getTemplateConfig(documentType);

    // Build template variables for text substitution
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const now = new Date();
    const templateVars: Record<string, string> = {
      FILIALE: filialeName,
      REFERENCE: bon.reference,
      DATE: now.toLocaleDateString('fr-FR'),
      TIME: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      COLLAB_NAME: bon.collaborateur?.displayName || '—',
      STATUS: this.getStatusLabel(bon.status),
    };

    const titleMap: Record<string, string> = {
      mise_disposition: `Bon de Mise à Disposition - ${bon.reference}`,
      restitution: `Bon de Restitution - ${bon.reference}`,
      cloture: `Procès-verbal d'équipements non restitués - ${bon.reference}`,
      avenant: `Avenant — Équipement(s) retrouvé(s) - ${bon.reference}`,
    };

    // Pre-load logo buffer asynchronously before synchronous PDF build
    const logoBuffer = await this.getLogoBuffer(bon.filiale?.logoPath || null);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: config.margins.top, bottom: config.margins.bottom, left: config.margins.left, right: config.margins.right },
        bufferPages: true,
        info: {
          Title: titleMap[documentType],
          Author: bon.createdBy?.displayName || 'Service IT',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.buildPdf(doc, bon, sigImages, documentType, logoBuffer, config, templateVars);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private buildPdf(
    doc: PDFKit.PDFDocument,
    bon: BonForPdf,
    sigImages: SigImages,
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant',
    logoBuffer: Buffer | null,
    config: PdfTemplateConfig,
    templateVars: Record<string, string>,
  ): void {
    const { colors, fonts } = config;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';

    // ─── HEADER ──────────────────────────────────────────────────────────────
    const headerY = doc.y;

    // Row 1: Title (full width, centered, on its own line)
    const titleText = substituteVars(config.header.titleText, templateVars);
    doc.font('Helvetica-Bold').fontSize(fonts.titleSize).fillColor(colors.primary);
    doc.text(titleText, leftX, headerY, { width: pageWidth, align: 'center' });
    const afterTitleY = doc.y + 4;

    // Row 2: Logo (left) | Subtitle (center) | Reference + dates (right)
    const row2Y = afterTitleY;

    // Logo (left)
    if (config.header.showLogo && logoBuffer) {
      try {
        doc.image(logoBuffer, leftX, row2Y, { height: config.header.logoMaxHeight, width: config.header.logoMaxWidth });
      } catch {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.primary).text(filialeName, leftX, row2Y);
      }
    } else if (config.header.showLogo && filialeName) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.primary).text(filialeName, leftX, row2Y);
    }

    // Subtitle (center)
    const subtitleText = substituteVars(config.header.subtitleText, templateVars);
    doc.font('Helvetica').fontSize(fonts.subtitleSize).fillColor(colors.gray);
    doc.text(subtitleText, leftX, row2Y + 4, { width: pageWidth, align: 'center' });

    // Reference + dates (right)
    let rightY = row2Y;
    if (config.header.showReference) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.dark);
      doc.text(bon.reference, leftX, rightY, { width: pageWidth, align: 'right' });
      rightY += 13;
    }
    if (config.header.showDates) {
      doc.font('Helvetica').fontSize(fonts.labelSize).fillColor(colors.gray);
      doc.text(`Émis le : ${this.formatDate(bon.dateMiseDisposition)}`, leftX, rightY, { width: pageWidth, align: 'right' });
      rightY += 9;
      if (bon.dateRestitution) {
        doc.text(`Restitution : ${this.formatDate(bon.dateRestitution)}`, leftX, rightY, { width: pageWidth, align: 'right' });
        rightY += 9;
      }
      doc.text(`Statut : ${this.getStatusLabel(bon.status)}`, leftX, rightY, { width: pageWidth, align: 'right' });
    }

    // Blue line under header
    const lineY = Math.max(row2Y + config.header.logoMaxHeight + 4, row2Y + 40);
    doc.moveTo(leftX, lineY).lineTo(leftX + pageWidth, lineY).lineWidth(2).strokeColor(colors.primary).stroke();
    doc.y = lineY + 14;

    // ─── INFO BOXES ──────────────────────────────────────────────────────────
    const boxWidth = (pageWidth - 14) / 2;
    const infoY = doc.y;

    // Collaborateur box (left)
    const collabRows: [string, string][] = [
      ['Nom complet', `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`],
      ['Email', bon.collaborateurEmail || '—'],
      ['Service', bon.collaborateur?.department || '—'],
    ];
    let collabBoxH = 0;
    if (config.infoBoxes.showCollaborateur) {
      collabBoxH = this.drawInfoBox(doc, leftX, infoY, boxWidth, config.infoBoxes.collaborateurTitle, collabRows, colors);
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
      entityBoxH = this.drawInfoBox(doc, rightBoxX, infoY, boxWidth, config.infoBoxes.entiteTitle, entityRows, colors);
    }

    // Advance Y past the tallest info box
    doc.y = infoY + Math.max(collabBoxH, entityBoxH) + 8;

    // ─── AVENANT NOTE ─────────────────────────────────────────────────────────
    if (documentType === 'avenant') {
      doc.y += 6;
      const noteY = doc.y;
      doc.rect(leftX, noteY, pageWidth, 28).fill('#f0fdf4').stroke();
      doc.font('Helvetica-Bold').fontSize(fonts.bodySize).fillColor('#15803d');
      doc.text(
        'Ce document atteste que les équipements ci-dessous, précédemment déclarés non restitués,',
        leftX + 8, noteY + 6, { width: pageWidth - 16 },
      );
      doc.font('Helvetica').fontSize(fonts.bodySize).fillColor('#15803d');
      doc.text(
        'ont été retrouvés et récupérés par le service informatique. Le procès-verbal de clôture initial reste valide.',
        leftX + 8, noteY + 16, { width: pageWidth - 16 },
      );
      doc.y = noteY + 34;
    }

    // ─── EQUIPMENT TABLE ─────────────────────────────────────────────────────
    doc.y += 8;
    const tableSectionLabel = substituteVars(config.table.sectionTitle, templateVars);
    this.drawSectionTitle(doc, leftX, tableSectionLabel, pageWidth, colors);
    doc.y += 4;

    const allEquipments = bon.equipments || [];
    // Filter equipment per document type
    type PdfEquipment = BonForPdf['equipments'][number];
    let equipments: PdfEquipment[];
    if (documentType === 'cloture') {
      equipments = allEquipments.filter((eq) => eq.notReturned === true);
    } else if (documentType === 'avenant') {
      const foundIds: string[] = bon._avenantEquipmentIds || [];
      equipments = foundIds.length > 0
        ? allEquipments.filter((eq) => foundIds.includes(eq.id))
        : allEquipments.filter((eq) => eq.returnedAt && !eq.notReturned);
    } else {
      equipments = allEquipments;
    }

    const hasStatutCol = documentType === 'restitution' || documentType === 'cloture';
    const colWidths = hasStatutCol
      ? [24, pageWidth * 0.24, pageWidth * 0.16, pageWidth * 0.16, pageWidth * 0.20, pageWidth - 24 - pageWidth * 0.76]
      : [28, pageWidth * 0.32, pageWidth * 0.22, pageWidth * 0.22, pageWidth - 28 - pageWidth * 0.76];
    const headers = hasStatutCol
      ? ['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Statut', 'Remarques']
      : ['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Remarques'];

    // Table header
    const tableY = doc.y;
    doc.rect(leftX, tableY, pageWidth, 18).fill(colors.headerBg);
    doc.font('Helvetica-Bold').fontSize(fonts.tableHeaderSize).fillColor('#ffffff');
    let colX = leftX + 4;
    headers.forEach((h, i) => {
      doc.text(h.toUpperCase(), colX, tableY + 5, { width: colWidths[i] - 8 });
      colX += colWidths[i];
    });
    doc.y = tableY + 18;

    // Table rows
    const ROW_HEIGHT = 16;
    const PAGE_BOTTOM = doc.page.height - doc.page.margins.bottom;

    if (equipments.length === 0) {
      doc.font('Helvetica').fontSize(fonts.tableBodySize).fillColor(colors.lightGray);
      doc.text(config.table.emptyMessage, leftX, doc.y + 6, { width: pageWidth, align: 'center' });
      doc.y += 24;
    } else {
      equipments.forEach((eq, i) => {
        // Page overflow: add new page and redraw table header if needed
        if (doc.y + ROW_HEIGHT > PAGE_BOTTOM - 40) {
          doc.addPage();
          // Redraw table header on new page
          const newHeaderY = doc.y;
          doc.rect(leftX, newHeaderY, pageWidth, 18).fill(colors.headerBg);
          doc.font('Helvetica-Bold').fontSize(fonts.tableHeaderSize).fillColor('#ffffff');
          let hColX = leftX + 4;
          headers.forEach((h, hi) => {
            doc.text(h.toUpperCase(), hColX, newHeaderY + 5, { width: colWidths[hi] - 8 });
            hColX += colWidths[hi];
          });
          doc.y = newHeaderY + 18;
        }

        const rowY = doc.y;
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || '—';

        // Alternate row background
        if (i % 2 === 1) {
          doc.rect(leftX, rowY, pageWidth, ROW_HEIGHT).fill(colors.rowAlt);
        }

        // Build statut text for restitution/cloture
        let statutText = '';
        if (hasStatutCol) {
          if (eq.returnedAt) {
            statutText = 'V Rendu';
          } else if (eq.notReturned) {
            statutText = `X Non rendu: ${eq.notReturnedReason || ''}`;
          } else {
            statutText = '... En attente';
          }
        }

        doc.font('Helvetica').fontSize(fonts.tableBodySize).fillColor(colors.dark);
        colX = leftX + 4;
        const rowData = hasStatutCol
          ? [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', statutText, eq.notes || '']
          : [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', eq.notes || ''];
        rowData.forEach((val, ci) => {
          const lastIdx = rowData.length - 1;
          doc.fillColor(ci === 0 || ci === lastIdx ? colors.gray : colors.dark);
          if (ci === 1) doc.font('Helvetica-Bold');
          else doc.font('Helvetica');
          doc.text(val, colX, rowY + 4, { width: colWidths[ci] - 8, lineBreak: false });
          colX += colWidths[ci];
        });

        // Row bottom border
        doc.moveTo(leftX, rowY + ROW_HEIGHT).lineTo(leftX + pageWidth, rowY + ROW_HEIGHT)
          .lineWidth(0.5).strokeColor(colors.border).stroke();
        doc.y = rowY + ROW_HEIGHT;
      });
    }

    // ─── NOTES ───────────────────────────────────────────────────────────────
    if (bon.notes) {
      doc.y += 8;
      doc.rect(leftX, doc.y, pageWidth, 1).fill(colors.border);
      doc.y += 6;
      doc.font('Helvetica-Bold').fontSize(fonts.labelSize).fillColor(colors.lightGray).text('REMARQUES GÉNÉRALES', leftX);
      doc.y += 4;
      doc.font('Helvetica').fontSize(fonts.bodySize).fillColor(colors.dark).text(bon.notes, leftX, doc.y, { width: pageWidth });
      doc.y += 12;
    }

    // ─── SIGNATURES ──────────────────────────────────────────────────────────
    if (config.signatures.showSignatures) {
      // Check if we need a new page for signatures
      if (doc.y > doc.page.height - 220) {
        doc.addPage();
      }

      doc.y += 8;
      this.drawSectionTitle(doc, leftX, 'SIGNATURES', pageWidth, colors);
      doc.y += 6;

      // Signature dates — use the latest it_cachet
      type PdfSignature = NonNullable<BonForPdf['signatures']>[number];
      const allSigs: PdfSignature[] = bon.signatures || [];
      const itSigs = allSigs.filter((s) => s.signed && s.type === 'it_cachet' && s.signatureImagePath);
      const itSig = itSigs.length > 0 ? itSigs[itSigs.length - 1] : null; // latest
      const collabSig = allSigs.find((s) => s.signed && s.signatureImagePath && s.type !== 'it_cachet');
      const itDate = itSig?.signedAt ? this.formatDate(itSig.signedAt) : '_______________';
      const collabDate = collabSig?.signedAt ? this.formatDate(collabSig.signedAt) : '_______________';

      if (documentType === 'avenant') {
        // IT signature only — full width
        this.drawSignatureBox(doc, leftX, doc.y, pageWidth, {
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
        this.drawSignatureBox(doc, leftX, sigY, sigBoxWidth, {
          title: config.signatures.itTitle,
          name: bon.createdBy?.displayName || '—',
          mention: config.signatures.itMention,
          signatureImage: sigImages.it,
          date: itDate,
        }, colors);

        // Collaborateur signature box
        this.drawSignatureBox(doc, leftX + sigBoxWidth + 24, sigY, sigBoxWidth, {
          title: config.signatures.collabTitle,
          name: `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`,
          mention: config.signatures.collabMention,
          signatureImage: sigImages.collab,
          date: collabDate,
        }, colors);

        doc.y = sigY + 130;
      }
    }

    // ─── FOOTER ──────────────────────────────────────────────────────────────
    if (config.footer.showFooter) {
      doc.y += 12;
      doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).lineWidth(0.5).strokeColor(colors.border).stroke();
      doc.y += 6;
      const footerText = substituteVars(config.footer.footerText, templateVars);
      doc.font('Helvetica').fontSize(fonts.labelSize).fillColor(colors.lightGray);
      doc.text(footerText, leftX, doc.y, { width: pageWidth, align: 'center' });
    }
  }

  // ─── Drawing helpers ─────────────────────────────────────────────────────────

  private drawSectionTitle(
    doc: PDFKit.PDFDocument, x: number, title: string, width: number,
    colors: PdfTemplateConfig['colors'],
  ): void {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.primary).text(title, x, doc.y);
    doc.y += 2;
    doc.moveTo(x, doc.y).lineTo(x + width, doc.y).lineWidth(1.5).strokeColor('#dbeafe').stroke();
    doc.y += 4;
  }

  /** Draws an info box and returns its actual height. */
  private drawInfoBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    title: string,
    rows: [string, string][],
    colors: PdfTemplateConfig['colors'],
  ): number {
    const LABEL_COL = 70;
    const PAD = 8;
    const valueWidth = width - PAD - LABEL_COL - PAD;
    const ROW_MIN = 14;

    // Measure each row height (value may wrap)
    const rowHeights = rows.map(([, value]) => {
      const h = doc.font('Helvetica-Bold').fontSize(8).heightOfString(value, { width: valueWidth });
      return Math.max(ROW_MIN, h + 4);
    });
    const totalRowsH = rowHeights.reduce((s, h) => s + h, 0);
    const boxHeight = 22 + totalRowsH + 6; // 22 = title area, 6 = bottom padding

    doc.rect(x, y, width, boxHeight).lineWidth(0.5).strokeColor(colors.border).stroke();

    // Title
    doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.lightGray);
    doc.text(title, x + PAD, y + 6, { width: width - PAD * 2 });
    doc.moveTo(x + PAD, y + 16).lineTo(x + width - PAD, y + 16).lineWidth(0.3).strokeColor('#f1f5f9').stroke();

    // Rows
    let rowY = y + 22;
    rows.forEach(([label, value], i) => {
      doc.font('Helvetica').fontSize(7).fillColor(colors.gray).text(label, x + PAD, rowY, { width: LABEL_COL });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.dark).text(value, x + PAD + LABEL_COL, rowY, { width: valueWidth });
      rowY += rowHeights[i];
    });

    return boxHeight;
  }

  private drawSignatureBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    opts: { title: string; name: string; mention: string; signatureImage: string | null; date: string },
    colors: PdfTemplateConfig['colors'],
  ): void {
    doc.rect(x, y, width, 145).lineWidth(0.5).strokeColor(colors.border).stroke();

    doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.gray).text(opts.title, x + 8, y + 8, { width: width - 16 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.dark).text(opts.name, x + 8, y + 20, { width: width - 16 });
    doc.font('Helvetica').fontSize(6.5).fillColor(colors.gray).text(opts.mention, x + 8, y + 32, { width: width - 16 });

    // Signature zone
    const sigZoneY = y + 48;
    const sigZoneH = 70;
    // Light background fill for the signature area
    doc.rect(x + 8, sigZoneY, width - 16, sigZoneH).fillColor('#f8fafc').fill();
    doc.rect(x + 8, sigZoneY, width - 16, sigZoneH).lineWidth(0.5).strokeColor(colors.border).stroke();

    if (opts.signatureImage) {
      try {
        const imgBuffer = this.dataUrlToBuffer(opts.signatureImage);
        if (imgBuffer) {
          doc.image(imgBuffer, x + 10, sigZoneY + 2, { fit: [width - 20, sigZoneH - 4], align: 'center', valign: 'center' });
        }
      } catch {
        // Fallback: placeholder text
        doc.font('Helvetica').fontSize(7).fillColor(colors.lightGray).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
      }
    } else {
      doc.font('Helvetica').fontSize(7).fillColor(colors.lightGray).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
    }

    doc.font('Helvetica').fontSize(7).fillColor(colors.gray).text(`Date : ${opts.date}`, x + 8, y + 128, { width: width - 16 });
  }

  // ─── Utility methods ─────────────────────────────────────────────────────────

  private async getLogoBuffer(logoPath: string | null): Promise<Buffer | null> {
    if (!logoPath) return null;
    const filename = logoPath.split('/').pop() || '';
    const fullPath = join(process.cwd(), 'data', 'uploads', filename);
    if (!existsSync(fullPath)) return null;
    try {
      return await readFile(fullPath);
    } catch {
      return null;
    }
  }

  private dataUrlToBuffer(dataUrl: string): Buffer | null {
    try {
      const matches = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!matches) return null;
      return Buffer.from(matches[1], 'base64');
    } catch {
      return null;
    }
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
  }
}
