import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

export interface SigImages {
  it: string | null;
  collab: string | null;
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
   * type = 'mise_disposition' | 'restitution'
   */
  async generateAndSave(
    bon: any,
    type: 'mise_disposition' | 'restitution',
    sigImages: SigImages = { it: null, collab: null },
  ): Promise<Buffer> {
    const pdf = await this.renderPdf(bon, sigImages);

    if (type === 'mise_disposition') {
      await this.prisma.bon.update({
        where: { id: bon.id },
        data: {
          pdfMiseDispoSnapshot: pdf,
          pdfMiseDispoSnapshotAt: new Date(),
        },
      });
    } else {
      await this.prisma.bon.update({
        where: { id: bon.id },
        data: {
          pdfRestitutionSnapshot: pdf,
          pdfRestitutionSnapshotAt: new Date(),
        },
      });
    }

    this.logger.log(`PDF snapshot ${type} sauvegardé pour le bon ${bon.reference}`);
    return pdf;
  }

  /** Génère le PDF sans le sauvegarder (appel à la demande). */
  async generateBonMiseDisposition(
    bon: any,
    sigImages: SigImages = { it: null, collab: null },
  ): Promise<Buffer> {
    return this.renderPdf(bon, sigImages);
  }

  // ─── Rendering (PDFKit) ────────────────────────────────────────────────────

  private async renderPdf(bon: any, sigImages: SigImages): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `Bon de Mise à Disposition - ${bon.reference}`,
          Author: bon.createdBy?.displayName || 'Service IT',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.buildPdf(doc, bon, sigImages);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private buildPdf(doc: PDFKit.PDFDocument, bon: any, sigImages: SigImages): void {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';

    // ─── HEADER ──────────────────────────────────────────────────────────────
    const headerY = doc.y;

    // Logo (left)
    const logoBuffer = this.getLogoBuffer(bon.filiale?.logoPath || null);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, leftX, headerY, { height: 40, width: 120 });
      } catch {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(filialeName, leftX, headerY);
      }
    } else if (filialeName) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(filialeName, leftX, headerY);
    }

    // Title (center)
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE);
    doc.text('BON DE MISE À DISPOSITION', leftX, headerY, { width: pageWidth, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    doc.text(`Équipements informatiques — ${filialeName}`, leftX, headerY + 18, { width: pageWidth, align: 'center' });

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

    // ─── EQUIPMENT TABLE ─────────────────────────────────────────────────────
    doc.y += 8;
    this.drawSectionTitle(doc, leftX, 'ÉQUIPEMENTS MIS À DISPOSITION', pageWidth);
    doc.y += 4;

    const equipments = bon.equipments || [];
    const colWidths = [28, pageWidth * 0.32, pageWidth * 0.22, pageWidth * 0.22, pageWidth - 28 - pageWidth * 0.76];
    const headers = ['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Remarques'];

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

        doc.font('Helvetica').fontSize(8).fillColor(DARK);
        colX = leftX + 4;
        const rowData = [
          `${i + 1}`,
          label,
          eq.serialNumber || '—',
          eq.inventoryNumber || '—',
          eq.notes || '',
        ];
        rowData.forEach((val, ci) => {
          doc.fillColor(ci === 0 || ci === 4 ? GRAY : DARK);
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

    const sigBoxWidth = (pageWidth - 24) / 2;
    const sigY = doc.y;

    // Signature dates
    const collabSig = (bon.signatures || []).find((s: any) => s.signed && s.signatureImagePath);
    const itSig = (bon.signatures || []).find((s: any) => s.signed && s.type === 'it_cachet' && s.signatureImagePath);
    const collabDate = collabSig?.signedAt ? this.formatDate(collabSig.signedAt) : '_______________';
    const itDate = itSig?.signedAt ? this.formatDate(itSig.signedAt) : '_______________';

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

  private getLogoBuffer(logoPath: string | null): Buffer | null {
    if (!logoPath) return null;
    const filename = logoPath.split('/').pop() || '';
    const fullPath = join(process.cwd(), 'data', 'uploads', filename);
    if (!existsSync(fullPath)) return null;
    try {
      return readFileSync(fullPath);
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
      archived: 'Archivé',
      cancelled: 'Annulé',
      contested: 'Contesté',
    };
    return labels[status] || status;
  }
}
