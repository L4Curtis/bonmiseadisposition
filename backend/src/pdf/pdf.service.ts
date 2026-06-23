import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
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
    // Métadonnées de preuve (certificat de signature électronique)
    signerEmail?: string | null;
    signerIp?: string | null;
    signerUserAgent?: string | null;
    mentionLuApprouve?: boolean;
    isInPerson?: boolean;
    signedByProxy?: boolean;
  }>;
  /** Used by avenant generation to filter equipment */
  _avenantEquipmentIds?: string[];
  /** Clôture unilatérale : remplace la mention de la case signature collaborateur */
  _unilateralNote?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfTemplatesService: PdfTemplatesService,
  ) {}

  /**
   * Génère le PDF d'un bon et le sauvegarde en base.
   * snapshotType = PdfSnapshotType enum value.
   *
   * Sémantique d'écrasement (UNIQUE(bonId, type) — une seule ligne par type) :
   * - signature_collab_mise_disposition : signé UNE fois → jamais écrasé ;
   * - signature_collab_restitution / cloture / it_* : régénérés par design
   *   (restitutions partielles successives, PV brouillon IT → PV co-signé) ;
   * - avenant : un seul avenant conservé par bon (limitation connue).
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

    // The signed mise-à-disposition document is legally final: never replace it
    if (snapshotType === 'signature_collab_mise_disposition') {
      const existing = await this.prisma.pdfSnapshot.findUnique({
        where: { bonId_type: { bonId: bon.id, type: snapshotType } },
        select: { id: true },
      });
      if (existing) {
        this.logger.warn(
          `Snapshot ${snapshotType} existe déjà pour le bon ${bon.reference} — document signé conservé, régénération ignorée`,
        );
        return pdf;
      }
    }

    // SHA-256 du document : chaîne de preuve — permet de vérifier a posteriori
    // que le PDF archivé (DB ou partage SMB) n'a pas été altéré
    const sha256 = createHash('sha256').update(pdf).digest('hex');

    // Upsert into PdfSnapshot table (le « courant » par type, pour l'affichage)
    await this.prisma.pdfSnapshot.upsert({
      where: { bonId_type: { bonId: bon.id, type: snapshotType as PdfSnapshotType } },
      update: { data: pdf, filename, sha256 },
      create: { bonId: bon.id, type: snapshotType as PdfSnapshotType, data: pdf, filename, sha256 },
    });

    // Archive APPEND-ONLY : copie scellée immuable de CE document. Garantit
    // qu'une preuve co-signée (ex. 1re restitution partielle) ne disparaît pas
    // quand un document du même type est régénéré plus tard.
    try {
      await this.prisma.proofArchive.create({
        data: { bonId: bon.id, type: snapshotType, filename, data: pdf, sha256 },
      });
    } catch (err) {
      this.logger.error(`Échec archivage probant [${bon.reference}/${snapshotType}]: ${(err as Error).message}`);
    }

    // Trace d'audit immuable du hash (le snapshot lui-même peut être ré-upserté)
    try {
      await this.prisma.auditLog.create({
        data: {
          bonId: bon.id,
          action: 'pdf_snapshot_saved',
          details: { type: snapshotType, filename, sha256 },
        },
      });
    } catch { /* non-blocking */ }

    this.logger.log(`PDF snapshot ${snapshotType} sauvegardé pour le bon ${bon.reference} (sha256=${sha256.slice(0, 12)}…)`);
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

    // Build template variables for text substitution.
    // IMPORTANT — déterminisme : le document de preuve NE DOIT PAS dépendre de
    // l'horloge murale (new Date()) ni du statut courant, sinon deux rendus du
    // même bon diffèrent et le SHA-256 ne prouve plus l'intégrité de ce que le
    // signataire a vu. DATE est ancrée sur la date métier (mise à disposition),
    // les horodatages réels des signatures figurent dans le certificat annexé.
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const templateVars: Record<string, string> = {
      FILIALE: filialeName,
      REFERENCE: bon.reference,
      DATE: this.formatDate(bon.dateMiseDisposition),
      TIME: '',
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
      // Le statut courant n'est PAS imprimé : il est volatil (active→archivé)
      // et casserait le déterminisme du document de preuve.
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

        colX = leftX + 4;
        const STATUT_COL = 4;
        const rowData: (string | null)[] = hasStatutCol
          ? [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', null, remarks]
          : [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', remarks];
        rowData.forEach((val, ci) => {
          const lastIdx = rowData.length - 1;
          if (hasStatutCol && ci === STATUT_COL && statut) {
            doc.circle(colX + 3, rowY + ROW_HEIGHT / 2, 2.2).fillColor(statut.color).fill();
            doc.font('Helvetica-Bold').fontSize(fonts.tableBodySize).fillColor(statut.color);
            doc.text(statut.label, colX + 9, rowY + 4, { width: colWidths[ci] - 13, lineBreak: false });
          } else {
            doc.font(ci === 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(fonts.tableBodySize);
            doc.fillColor(ci === 0 || ci === lastIdx ? colors.gray : colors.dark);
            doc.text(val ?? '', colX, rowY + 4, { width: colWidths[ci] - 8, lineBreak: false });
          }
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

        // Collaborateur signature box. En clôture unilatérale, la mention
        // « constaté sans signature » remplace la mention standard.
        this.drawSignatureBox(doc, leftX + sigBoxWidth + 24, sigY, sigBoxWidth, {
          title: config.signatures.collabTitle,
          name: `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`,
          mention: bon._unilateralNote ?? config.signatures.collabMention,
          signatureImage: bon._unilateralNote ? null : sigImages.collab,
          date: collabDate,
        }, colors);

        doc.y = sigY + 130;
      }
    }

    // ─── CERTIFICAT DE SIGNATURE ÉLECTRONIQUE ────────────────────────────────
    this.drawCertificate(doc, bon, leftX, pageWidth, colors, fonts);

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

    doc.roundedRect(x, y, width, boxHeight, 8).lineWidth(0.5).fillAndStroke(colors.rowAlt, colors.border);

    // Title
    doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.primary);
    doc.text(title.toUpperCase(), x + PAD, y + 7, { width: width - PAD * 2, characterSpacing: 0.4 });
    doc.moveTo(x + PAD, y + 17).lineTo(x + width - PAD, y + 17).lineWidth(0.3).strokeColor(colors.border).stroke();

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
    doc.roundedRect(x, y, width, 145, 8).lineWidth(0.5).strokeColor(colors.border).stroke();

    doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.primary).text(opts.title.toUpperCase(), x + 10, y + 9, { width: width - 20, characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.dark).text(opts.name, x + 10, y + 21, { width: width - 20 });
    doc.font('Helvetica').fontSize(6.5).fillColor(colors.gray).text(opts.mention, x + 10, y + 33, { width: width - 20 });

    // Signature zone
    const sigZoneY = y + 48;
    const sigZoneH = 70;
    // Light background fill for the signature area (couleur fixe : déterministe)
    doc.roundedRect(x + 10, sigZoneY, width - 20, sigZoneH, 6).fillColor('#f8fafc').fill();
    doc.roundedRect(x + 10, sigZoneY, width - 20, sigZoneH, 6).lineWidth(0.5).strokeColor(colors.border).stroke();

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

  // ─── Certificat de signature électronique ────────────────────────────────────

  private static readonly ROLE_LABELS: Record<string, string> = {
    it_cachet: 'Service informatique — cachet',
    mise_disposition: 'Collaborateur',
    restitution: 'Collaborateur',
    pv_cloture: 'Collaborateur — procès-verbal',
  };

  /**
   * Annexe un certificat de signature électronique : pour chaque signature
   * réellement apposée, l'identité, l'horodatage, l'IP, le user-agent et la
   * mention « Lu et approuvé ». C'est la pièce probante d'un e-sign 2026 —
   * elle rend le PDF auto-portant en cas de litige.
   */
  private drawCertificate(
    doc: PDFKit.PDFDocument,
    bon: BonForPdf,
    leftX: number,
    pageWidth: number,
    colors: PdfTemplateConfig['colors'],
    fonts: PdfTemplateConfig['fonts'],
  ): void {
    const signed = (bon.signatures || []).filter((s) => s.signed && s.signedAt);
    if (signed.length === 0) return;
    signed.sort((a, b) => new Date(a.signedAt!).getTime() - new Date(b.signedAt!).getTime());

    // Nouvelle page si l'espace restant est insuffisant
    const NEEDED = 90 + signed.length * 70;
    if (doc.y + NEEDED > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    } else {
      doc.y += 16;
    }

    this.drawSectionTitle(doc, leftX, 'CERTIFICAT DE SIGNATURE ÉLECTRONIQUE', pageWidth, colors);
    doc.y += 6;
    doc.font('Helvetica').fontSize(fonts.labelSize).fillColor(colors.gray);
    doc.text(
      `Réf. ${bon.reference} — Les signatures ci-dessous ont été recueillies électroniquement par l'application Bons IT.`,
      leftX, doc.y, { width: pageWidth },
    );
    doc.y += 16;

    for (const sig of signed) {
      const cardY = doc.y;
      const cardH = sig.signedByProxy ? 62 : 52;
      doc.roundedRect(leftX, cardY, pageWidth, cardH, 8).lineWidth(0.5).fillAndStroke(colors.rowAlt, colors.border);

      // Pastille de rôle + « signé électroniquement »
      const role = PdfService.ROLE_LABELS[sig.type] || 'Signataire';
      doc.circle(leftX + 14, cardY + 14, 2.6).fillColor('#16a34a').fill();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.dark).text(role, leftX + 22, cardY + 10, { width: pageWidth - 220 });
      doc.font('Helvetica').fontSize(6.5).fillColor('#16a34a').text('SIGNÉ ÉLECTRONIQUEMENT', leftX + 22, cardY + 22, { width: pageWidth - 220, characterSpacing: 0.4 });
      if (sig.isInPerson) {
        const presLabel = sig.signedByProxy
          ? 'Signature recueillie en présentiel (mandataire)'
          : 'Signature recueillie en présentiel';
        doc.font('Helvetica').fontSize(6.5).fillColor(colors.gray).text(presLabel, leftX + 22, cardY + 32, { width: pageWidth - 220 });
      }
      if (sig.mentionLuApprouve) {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(colors.gray).text('« Lu et approuvé »', leftX + 22, cardY + (sig.isInPerson ? 41 : 32), { width: pageWidth - 220 });
      }

      // Colonne droite : identité, horodatage, IP, UA. En présentiel par
      // mandataire, on distingue le TITULAIRE du compte ayant recueilli la signature.
      const rX = leftX + pageWidth - 200;
      const rW = 196;
      let ry = cardY + 8;
      const meta: [string, string][] = sig.signedByProxy
        ? [
            ['Titulaire', bon.collaborateurEmail || '—'],
            ['Recueilli par', sig.signerEmail || '—'],
            ['Horodatage', this.formatDateTime(sig.signedAt)],
            ['Adresse IP', sig.signerIp || '—'],
          ]
        : [
            ['Identité', sig.signerEmail || '—'],
            ['Horodatage', this.formatDateTime(sig.signedAt)],
            ['Adresse IP', sig.signerIp || '—'],
          ];
      for (const [k, v] of meta) {
        doc.font('Helvetica').fontSize(6.5).fillColor(colors.gray).text(`${k} : `, rX, ry, { width: rW, continued: true });
        doc.font('Helvetica-Bold').fillColor(colors.dark).text(v, { width: rW });
        ry += 11;
      }
      if (sig.signerUserAgent) {
        doc.font('Helvetica').fontSize(5.5).fillColor(colors.lightGray).text(sig.signerUserAgent.slice(0, 70), rX, ry, { width: rW, lineBreak: false });
      }

      doc.y = cardY + cardH + 8;
    }

    // Sceau d'intégrité
    doc.font('Helvetica').fontSize(6.5).fillColor(colors.lightGray);
    doc.text(
      "L'intégrité de ce document est scellée par une empreinte numérique SHA-256 conservée dans le journal d'audit du système. Toute modification ultérieure du fichier invaliderait cette empreinte.",
      leftX, doc.y + 2, { width: pageWidth, align: 'left' },
    );
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

  /** Horodatage complet (date + heure + fuseau) pour le certificat de preuve. */
  private formatDateTime(date: Date | string | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Paris', timeZoneName: 'short',
    });
  }

  private getStatusLabel(status: string): string {
    return STATUS_LABELS[status] || status;
  }
}
