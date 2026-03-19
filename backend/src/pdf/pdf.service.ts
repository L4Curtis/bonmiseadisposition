import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export interface SigImages {
  it: string | null;
  collab: string | null;
}

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

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private async renderPdf(bon: any, sigImages: SigImages): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    const html = this.buildHtml(bon, sigImages);

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private getLogoBase64(logoPath: string | null): string | null {
    if (!logoPath) return null;
    const filename = logoPath.split('/').pop() || '';
    const fullPath = join(process.cwd(), 'data', 'uploads', filename);
    if (!existsSync(fullPath)) return null;
    try {
      const data = readFileSync(fullPath);
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mime =
        ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${data.toString('base64')}`;
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

  private buildHtml(bon: any, sigImages: SigImages): string {
    const logoBase64 = this.getLogoBase64(bon.filiale?.logoPath || null);
    const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';

    const equipmentRows = (bon.equipments || [])
      .map(
        (eq: any, i: number) => {
          const label = eq.catalogItem
            ? `${eq.catalogItem.brand} ${eq.catalogItem.model}`
            : eq.customLabel || '—';
          return `<tr>
          <td style="width:28px;text-align:center;color:#64748b">${i + 1}</td>
          <td><strong>${label}</strong></td>
          <td>${eq.serialNumber || '<span style="color:#94a3b8">—</span>'}</td>
          <td>${eq.inventoryNumber || '<span style="color:#94a3b8">—</span>'}</td>
          <td style="color:#64748b">${eq.notes || ''}</td>
        </tr>`;
        },
      )
      .join('');

    // Signature dates
    const collabSig = (bon.signatures || []).find(
      (s: any) => s.signed && s.signatureImagePath,
    );
    const itSig = (bon.signatures || []).find(
      (s: any) => s.signed && s.type === 'it_cachet' && s.signatureImagePath,
    );
    const collabDate = collabSig?.signedAt ? this.formatDate(collabSig.signedAt) : '_______________';
    const itDate = itSig?.signedAt ? this.formatDate(itSig.signedAt) : '_______________';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 3px solid #2563eb; }
  .logo { max-height: 56px; max-width: 160px; object-fit: contain; }
  .logo-placeholder { font-size: 15px; font-weight: bold; color: #2563eb; }
  .title-block { text-align: center; }
  .title { font-size: 17px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 1px; }
  .subtitle { font-size: 10px; color: #64748b; margin-top: 3px; }
  .ref-block { text-align: right; font-size: 10px; color: #475569; min-width: 150px; }
  .ref-block .ref { font-size: 13px; font-weight: bold; color: #1e293b; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .info-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 11px 13px; }
  .info-box-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; font-weight: bold; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #f1f5f9; }
  .info-row { display: flex; margin-bottom: 4px; gap: 6px; }
  .info-label { color: #64748b; width: 100px; flex-shrink: 0; font-size: 10px; }
  .info-value { font-weight: 500; font-size: 11px; }
  .section-title { font-size: 10px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #dbeafe; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 10.5px; }
  table thead tr { background: #2563eb; }
  table th { color: white; padding: 7px 9px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; }
  table td { padding: 6px 9px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  table tbody tr:nth-child(even) td { background: #f8fafc; }
  table tbody tr:last-child td { border-bottom: none; }
  .empty-row td { text-align: center; color: #94a3b8; padding: 16px; }
  .notes-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 13px; margin-bottom: 18px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; }
  .sig-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .sig-title { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: bold; margin-bottom: 6px; }
  .sig-name { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
  .sig-mention { font-size: 9px; color: #64748b; margin-bottom: 8px; font-style: italic; }
  .sig-zone { border: 1px dashed #cbd5e1; border-radius: 4px; height: 72px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px; }
  .sig-img { max-height: 72px; max-width: 100%; object-fit: contain; display: block; }
  .sig-date { margin-top: 6px; font-size: 9px; color: #64748b; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div>
    ${logoBase64
      ? `<img src="${logoBase64}" class="logo" alt="Logo ${filialeName}" />`
      : `<div class="logo-placeholder">${filialeName}</div>`}
  </div>
  <div class="title-block">
    <div class="title">Bon de Mise à Disposition</div>
    <div class="subtitle">Équipements informatiques — ${filialeName}</div>
  </div>
  <div class="ref-block">
    <div class="ref">${bon.reference}</div>
    <div style="margin-top:5px">Émis le : ${this.formatDate(bon.dateMiseDisposition)}</div>
    ${bon.dateRestitution ? `<div>Restitution : ${this.formatDate(bon.dateRestitution)}</div>` : ''}
    <div style="margin-top:5px">
      <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:600;text-transform:uppercase">
        ${this.getStatusLabel(bon.status)}
      </span>
    </div>
  </div>
</div>

<!-- INFO -->
<div class="info-grid">
  <div class="info-box">
    <div class="info-box-title">Collaborateur</div>
    <div class="info-row">
      <span class="info-label">Nom complet</span>
      <span class="info-value">${civiliteLabel} ${bon.collaborateur?.displayName || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Email</span>
      <span class="info-value">${bon.collaborateurEmail || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Service</span>
      <span class="info-value">${bon.collaborateur?.department || '—'}</span>
    </div>
  </div>
  <div class="info-box">
    <div class="info-box-title">Entité / Filiale</div>
    <div class="info-row">
      <span class="info-label">Filiale</span>
      <span class="info-value">${bon.filiale?.displayName || bon.filiale?.name || '—'}</span>
    </div>
    ${bon.filiale?.address ? `<div class="info-row"><span class="info-label">Adresse</span><span class="info-value">${bon.filiale.address}</span></div>` : ''}
    ${bon.filiale?.siret ? `<div class="info-row"><span class="info-label">SIRET</span><span class="info-value">${bon.filiale.siret}</span></div>` : ''}
    <div class="info-row">
      <span class="info-label">Créé par</span>
      <span class="info-value">${bon.createdBy?.displayName || '—'}</span>
    </div>
  </div>
</div>

<!-- EQUIPMENT TABLE -->
<div class="section-title">Équipements mis à disposition</div>
<table>
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Désignation</th>
      <th style="width:130px">N° Série</th>
      <th style="width:130px">N° Inventaire</th>
      <th style="width:100px">Remarques</th>
    </tr>
  </thead>
  <tbody>
    ${
      (bon.equipments || []).length > 0
        ? equipmentRows
        : '<tr class="empty-row"><td colspan="5">Aucun équipement enregistré</td></tr>'
    }
  </tbody>
</table>

${
  bon.notes
    ? `<div class="notes-box">
        <div class="info-box-title">Remarques générales</div>
        <div style="font-size:11px">${bon.notes}</div>
       </div>`
    : ''
}

<!-- SIGNATURES -->
<div class="section-title">Signatures</div>
<div class="signatures">
  <div class="sig-box">
    <div class="sig-title">Service informatique</div>
    <div class="sig-name">${bon.createdBy?.displayName || '—'}</div>
    <div class="sig-mention">Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement</div>
    ${sigImages.it
      ? `<img class="sig-img" src="${sigImages.it}" alt="Signature IT" />`
      : `<div class="sig-zone">Signature IT / Cachet</div>`}
    <div class="sig-date">Date : ${itDate}</div>
  </div>
  <div class="sig-box">
    <div class="sig-title">Collaborateur</div>
    <div class="sig-name">${civiliteLabel} ${bon.collaborateur?.displayName || '—'}</div>
    <div class="sig-mention">Lu et approuvé — Je reconnais avoir reçu les équipements listés ci-dessus en bon état</div>
    ${sigImages.collab
      ? `<img class="sig-img" src="${sigImages.collab}" alt="Signature collaborateur" />`
      : `<div class="sig-zone">Signature collaborateur</div>`}
    <div class="sig-date">Date : ${collabDate}</div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} —
  ${filialeName} — Réf. ${bon.reference}
</div>

</body>
</html>`;
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
