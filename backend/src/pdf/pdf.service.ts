import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

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

// ─── Couleurs ──────────────────────────────────────────────────────────────────
const BLUE = '#2563eb';
const DARK = '#1e293b';
const GRAY = '#64748b';
const LIGHT_GRAY = '#94a3b8';
const BORDER = '#e2e8f0';
const HEADER_BG = '#2563eb';
const ROW_ALT = '#f8fafc';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // Upsert into PdfSnapshot table
    await this.prisma.pdfSnapshot.upsert({
      where: { bonId_type: { bonId: bon.id, type: snapshotType as any } },
      update: { data: pdf, filename },
      create: { bonId: bon.id, type: snapshotType as any, data: pdf, filename },
    });

    this.logger.log(`PDF snapshot ${snapshotType} sauvegardé pour le bon ${bon.reference}`);
    return pdf;
  }

  private getDocumentType(snapshotType: string): 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' {
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
  ): Promise<Buffer> {
    return this.renderPdf(bon, sigImages, documentType);
  }

  // ─── Rendering (PDFKit) ────────────────────────────────────────────────────

  private async renderPdf(
    bon: BonForPdf,
    sigImages: SigImages,
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' = 'mise_disposition',
  ): Promise<Buffer> {
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
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
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
        this.buildPdf(doc, bon, sigImages, documentType, logoBuffer);
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
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' = 'mise_disposition',
    logoBuffer: Buffer | null = null,
  ): void {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';

    // ─── HEADER ──────────────────────────────────────────────────────────────
    const headerY = doc.y;

    // Logo (left)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, leftX, headerY, { height: 40, width: 120 });
      } catch {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(filialeName, leftX, headerY);
      }
    } else if (filialeName) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(filialeName, leftX, headerY);
    }

    // Title (center) — conditional on documentType
    const titleTextMap: Record<string, string> = {
      mise_disposition: 'BON DE MISE À DISPOSITION',
      restitution: 'BON DE RESTITUTION',
      cloture: 'PROCÈS-VERBAL D\'ÉQUIPEMENTS NON RESTITUÉS',
      avenant: 'AVENANT — ÉQUIPEMENT(S) RETROUVÉ(S)',
    };
    const subtitleTextMap: Record<string, string> = {
      mise_disposition: `Équipements informatiques — ${filialeName}`,
      restitution: `Restitution des équipements — ${filialeName}`,
      cloture: `Équipements non rendus — ${filialeName}`,
      avenant: `Mise à jour du PV de clôture — ${filialeName}`,
    };
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE);
    doc.text(titleTextMap[documentType], leftX, headerY, { width: pageWidth, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    doc.text(subtitleTextMap[documentType], leftX, headerY + 18, { width: pageWidth, align: 'center' });

    // Reference (right)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK);
    doc.text(bon.reference, leftX, headerY, { width: pageWidth, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor(GRAY);
    doc.text(`Émis le : ${this.formatDate(bon.dateMiseDisposition)}`, leftX, headerY + 14, { width: pageWidth, align: 'right' });
    if (bon.dateRestitution) {
      doc.text(`Restitution : ${this.formatDate(bon.dateRestitution)}`, leftX, headerY + 23, { width: pageWidth, align: 'right' });
    }
    doc.text(`Statut : ${this.getStatusLabel(bon.status)}`, leftX, headerY + (bon.dateRestitution ? 32 : 23), { width: pageWidth, align: 'right' });

    // Blue line under header
    const lineY = headerY + 48;
    doc.moveTo(leftX, lineY).lineTo(leftX + pageWidth, lineY).lineWidth(2).strokeColor(BLUE).stroke();
    doc.y = lineY + 14;

    // ─── INFO BOXES ──────────────────────────────────────────────────────────
    const boxWidth = (pageWidth - 14) / 2;
    const infoY = doc.y;

    // Collaborateur box (left)
    this.drawInfoBox(doc, leftX, infoY, boxWidth, 'COLLABORATEUR', [
      ['Nom complet', `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`],
      ['Email', bon.collaborateurEmail || '—'],
      ['Service', bon.collaborateur?.department || '—'],
    ]);

    // Entité box (right)
    const rightBoxX = leftX + boxWidth + 14;
    const entityRows: [string, string][] = [
      ['Filiale', bon.filiale?.displayName || bon.filiale?.name || '—'],
    ];
    if (bon.filiale?.address) entityRows.push(['Adresse', bon.filiale.address]);
    if (bon.filiale?.siret) entityRows.push(['SIRET', bon.filiale.siret]);
    entityRows.push(['Créé par', bon.createdBy?.displayName || '—']);
    this.drawInfoBox(doc, rightBoxX, infoY, boxWidth, 'ENTITÉ / FILIALE', entityRows);

    doc.y = infoY + 80;

    // ─── AVENANT NOTE ─────────────────────────────────────────────────────────
    if (documentType === 'avenant') {
      doc.y += 6;
      const noteY = doc.y;
      doc.rect(leftX, noteY, pageWidth, 28).fill('#f0fdf4').stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#15803d');
      doc.text(
        'Ce document atteste que les équipements ci-dessous, précédemment déclarés non restitués,',
        leftX + 8, noteY + 6, { width: pageWidth - 16 },
      );
      doc.font('Helvetica').fontSize(8).fillColor('#15803d');
      doc.text(
        'ont été retrouvés et récupérés par le service informatique. Le procès-verbal de clôture initial reste valide.',
        leftX + 8, noteY + 16, { width: pageWidth - 16 },
      );
      doc.y = noteY + 34;
    }

    // ─── EQUIPMENT TABLE ─────────────────────────────────────────────────────
    doc.y += 8;
    const tableSectionLabel = documentType === 'avenant'
      ? 'ÉQUIPEMENTS RETROUVÉS'
      : 'ÉQUIPEMENTS MIS À DISPOSITION';
    this.drawSectionTitle(doc, leftX, tableSectionLabel, pageWidth);
    doc.y += 4;

    const allEquipments = bon.equipments || [];
    // Filter equipment per document type
    let equipments: any[];
    if (documentType === 'cloture') {
      equipments = allEquipments.filter((eq: any) => eq.notReturned === true);
    } else if (documentType === 'avenant') {
      // Show only the equipment just found (passed via _avenantEquipmentIds)
      const foundIds: string[] = bon._avenantEquipmentIds || [];
      equipments = foundIds.length > 0
        ? allEquipments.filter((eq: any) => foundIds.includes(eq.id))
        : allEquipments.filter((eq: any) => eq.returnedAt && !eq.notReturned);
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
    doc.rect(leftX, tableY, pageWidth, 18).fill(HEADER_BG);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
    let colX = leftX + 4;
    headers.forEach((h, i) => {
      doc.text(h.toUpperCase(), colX, tableY + 5, { width: colWidths[i] - 8 });
      colX += colWidths[i];
    });
    doc.y = tableY + 18;

    // Table rows
    if (equipments.length === 0) {
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_GRAY);
      doc.text('Aucun équipement enregistré', leftX, doc.y + 6, { width: pageWidth, align: 'center' });
      doc.y += 24;
    } else {
      equipments.forEach((eq: any, i: number) => {
        const rowY = doc.y;
        const label = eq.catalogItem
          ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
          : eq.customLabel || '—';

        // Alternate row background
        if (i % 2 === 1) {
          doc.rect(leftX, rowY, pageWidth, 16).fill(ROW_ALT);
        }

        // Build statut text for restitution/cloture
        let statutText = '';
        if (hasStatutCol) {
          if (eq.returnedAt) {
            statutText = '\u2713 Rendu';
          } else if (eq.notReturned) {
            statutText = `\u2717 Non rendu: ${eq.notReturnedReason || ''}`;
          } else {
            statutText = '\u231B En attente';
          }
        }

        doc.font('Helvetica').fontSize(8).fillColor(DARK);
        colX = leftX + 4;
        const rowData = hasStatutCol
          ? [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', statutText, eq.notes || '']
          : [`${i + 1}`, label, eq.serialNumber || '—', eq.inventoryNumber || '—', eq.notes || ''];
        rowData.forEach((val, ci) => {
          const lastIdx = rowData.length - 1;
          doc.fillColor(ci === 0 || ci === lastIdx ? GRAY : DARK);
          if (ci === 1) doc.font('Helvetica-Bold');
          else doc.font('Helvetica');
          doc.text(val, colX, rowY + 4, { width: colWidths[ci] - 8, lineBreak: false });
          colX += colWidths[ci];
        });

        // Row bottom border
        doc.moveTo(leftX, rowY + 16).lineTo(leftX + pageWidth, rowY + 16)
          .lineWidth(0.5).strokeColor(BORDER).stroke();
        doc.y = rowY + 16;
      });
    }

    // ─── NOTES ───────────────────────────────────────────────────────────────
    if (bon.notes) {
      doc.y += 8;
      doc.rect(leftX, doc.y, pageWidth, 1).fill(BORDER);
      doc.y += 6;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT_GRAY).text('REMARQUES GÉNÉRALES', leftX);
      doc.y += 4;
      doc.font('Helvetica').fontSize(8).fillColor(DARK).text(bon.notes, leftX, doc.y, { width: pageWidth });
      doc.y += 12;
    }

    // ─── SIGNATURES ──────────────────────────────────────────────────────────
    // Check if we need a new page for signatures
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
    }

    doc.y += 8;
    this.drawSectionTitle(doc, leftX, 'SIGNATURES', pageWidth);
    doc.y += 6;

    // Signature dates — use the latest it_cachet
    const allSigs: any[] = bon.signatures || [];
    const itSigs = allSigs.filter((s: any) => s.signed && s.type === 'it_cachet' && s.signatureImagePath);
    const itSig = itSigs.length > 0 ? itSigs[itSigs.length - 1] : null; // latest
    const collabSig = allSigs.find((s: any) => s.signed && s.signatureImagePath && s.type !== 'it_cachet');
    const itDate = itSig?.signedAt ? this.formatDate(itSig.signedAt) : '_______________';
    const collabDate = collabSig?.signedAt ? this.formatDate(collabSig.signedAt) : '_______________';

    if (documentType === 'avenant') {
      // IT signature only — full width
      this.drawSignatureBox(doc, leftX, doc.y, pageWidth, {
        title: 'SERVICE INFORMATIQUE — ATTESTATION',
        name: bon.createdBy?.displayName || '—',
        mention: 'Je certifie que le(s) équipement(s) listé(s) ci-dessus ont été retrouvés et récupérés à la date indiquée.',
        signatureImage: sigImages.it,
        date: itDate,
      });
      doc.y += 130;
    } else {
      const sigBoxWidth = (pageWidth - 24) / 2;
      const sigY = doc.y;

      // IT signature box
      this.drawSignatureBox(doc, leftX, sigY, sigBoxWidth, {
        title: 'SERVICE INFORMATIQUE',
        name: bon.createdBy?.displayName || '—',
        mention: 'Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement',
        signatureImage: sigImages.it,
        date: itDate,
      });

      // Collaborateur signature box
      this.drawSignatureBox(doc, leftX + sigBoxWidth + 24, sigY, sigBoxWidth, {
        title: 'COLLABORATEUR',
        name: `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`,
        mention: 'Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état',
        signatureImage: sigImages.collab,
        date: collabDate,
      });

      doc.y = sigY + 130;
    }

    // ─── FOOTER ──────────────────────────────────────────────────────────────
    doc.y += 12;
    doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.y += 6;
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    doc.font('Helvetica').fontSize(7).fillColor(LIGHT_GRAY);
    doc.text(`Document généré le ${dateStr} à ${timeStr} — ${filialeName} — Réf. ${bon.reference}`, leftX, doc.y, {
      width: pageWidth,
      align: 'center',
    });
  }

  // ─── Drawing helpers ─────────────────────────────────────────────────────────

  private drawSectionTitle(doc: PDFKit.PDFDocument, x: number, title: string, width: number): void {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE).text(title, x, doc.y);
    doc.y += 2;
    doc.moveTo(x, doc.y).lineTo(x + width, doc.y).lineWidth(1.5).strokeColor('#dbeafe').stroke();
    doc.y += 4;
  }

  private drawInfoBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    title: string,
    rows: [string, string][],
  ): void {
    const boxHeight = 14 + rows.length * 14 + 6;
    doc.rect(x, y, width, boxHeight).lineWidth(0.5).strokeColor(BORDER).stroke();

    // Title
    doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT_GRAY);
    doc.text(title, x + 8, y + 6, { width: width - 16 });
    doc.moveTo(x + 8, y + 16).lineTo(x + width - 8, y + 16).lineWidth(0.3).strokeColor('#f1f5f9').stroke();

    // Rows
    let rowY = y + 22;
    rows.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(7).fillColor(GRAY).text(label, x + 8, rowY, { width: 70 });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK).text(value, x + 80, rowY, { width: width - 88, lineBreak: false });
      rowY += 14;
    });
  }

  private drawSignatureBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    opts: { title: string; name: string; mention: string; signatureImage: string | null; date: string },
  ): void {
    doc.rect(x, y, width, 120).lineWidth(0.5).strokeColor(BORDER).stroke();

    doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAY).text(opts.title, x + 8, y + 8, { width: width - 16 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(opts.name, x + 8, y + 20, { width: width - 16 });
    doc.font('Helvetica').fontSize(6.5).fillColor(GRAY).text(opts.mention, x + 8, y + 32, { width: width - 16 });

    // Signature zone
    const sigZoneY = y + 50;
    const sigZoneH = 50;
    if (opts.signatureImage) {
      try {
        const imgBuffer = this.dataUrlToBuffer(opts.signatureImage);
        if (imgBuffer) {
          doc.image(imgBuffer, x + 10, sigZoneY, { height: sigZoneH - 4, width: width - 20, fit: [width - 20, sigZoneH - 4] });
        }
      } catch {
        // Fallback: empty zone
        doc.rect(x + 8, sigZoneY, width - 16, sigZoneH).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke().undash();
        doc.font('Helvetica').fontSize(7).fillColor(LIGHT_GRAY).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
      }
    } else {
      doc.rect(x + 8, sigZoneY, width - 16, sigZoneH).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke().undash();
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_GRAY).text('Signature', x + 8, sigZoneY + 20, { width: width - 16, align: 'center' });
    }

    doc.font('Helvetica').fontSize(7).fillColor(GRAY).text(`Date : ${opts.date}`, x + 8, y + 104, { width: width - 16 });
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
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      sent_mise_dispo: 'En attente signature',
      active: 'Actif',
      sent_restitution: 'Restitution en attente',
      partially_returned: 'Partiellement restitué',
      archived: 'Archivé',
      cancelled: 'Annulé',
      contested: 'Contesté',
    };
    return labels[status] || status;
  }
}
