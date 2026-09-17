import { BonForPdf } from '../pdf.service';
import { PdfColorScheme, PdfFontsConfig } from '../pdf-template-config';
import { RenderFonts, drawSectionTitle, formatDateTime } from './layout';

// ─── CERTIFICAT DE SIGNATURE ÉLECTRONIQUE ─────────────────────────────────────
// Pièce probante annexée au document : rôle + phase de chaque signature,
// horodatage, IP, user-agent, mention « Lu et approuvé ».

export const ROLE_LABELS: Record<string, string> = {
  it_cachet: 'Service informatique — cachet',
  mise_disposition: 'Collaborateur — mise à disposition',
  restitution: 'Collaborateur — restitution',
  pv_cloture: 'Collaborateur — procès-verbal de clôture',
};

/** Libellé d'une signature dans le certificat : rôle + phase (le cachet IT
 *  précise la phase via pdfType quand elle est connue). */
export function certificateLabel(sig: { type: string; pdfType?: string | null }): string {
  const base = ROLE_LABELS[sig.type] ?? sig.type;
  if (sig.type !== 'it_cachet' || !sig.pdfType) return base;
  return `${base} — ${sig.pdfType === 'restitution' ? 'restitution' : 'mise à disposition'}`;
}

/**
 * Annexe un certificat de signature électronique : pour chaque signature
 * réellement apposée, l'identité, l'horodatage, l'IP, le user-agent et la
 * mention « Lu et approuvé ». C'est la pièce probante d'un e-sign 2026 —
 * elle rend le PDF auto-portant en cas de litige.
 */
export function drawCertificateSection(
  doc: PDFKit.PDFDocument,
  bon: BonForPdf,
  leftX: number,
  pageWidth: number,
  colors: PdfColorScheme,
  fonts: PdfFontsConfig,
  fontNames: RenderFonts,
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

  drawSectionTitle(doc, leftX, 'CERTIFICAT DE SIGNATURE ÉLECTRONIQUE', pageWidth, colors, fontNames);
  doc.y += 6;
  doc.font(fontNames.regular).fontSize(fonts.labelSize).fillColor(colors.gray);
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
    const role = certificateLabel(sig) || 'Signataire';
    doc.circle(leftX + 14, cardY + 14, 2.6).fillColor('#16a34a').fill();
    doc.font(fontNames.bold).fontSize(8).fillColor(colors.dark).text(role, leftX + 22, cardY + 10, { width: pageWidth - 220 });
    doc.font(fontNames.regular).fontSize(6.5).fillColor('#16a34a').text('SIGNÉ ÉLECTRONIQUEMENT', leftX + 22, cardY + 22, { width: pageWidth - 220, characterSpacing: 0.4 });
    if (sig.isInPerson) {
      const presLabel = sig.signedByProxy
        ? 'Signature recueillie en présentiel (mandataire)'
        : 'Signature recueillie en présentiel';
      doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.gray).text(presLabel, leftX + 22, cardY + 32, { width: pageWidth - 220 });
    }
    if (sig.mentionLuApprouve) {
      doc.font(fontNames.bold).fontSize(6.5).fillColor(colors.gray).text('« Lu et approuvé »', leftX + 22, cardY + (sig.isInPerson ? 41 : 32), { width: pageWidth - 220 });
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
          ['Horodatage', formatDateTime(sig.signedAt)],
          ['Adresse IP', sig.signerIp || '—'],
        ]
      : [
          ['Identité', sig.signerEmail || '—'],
          ['Horodatage', formatDateTime(sig.signedAt)],
          ['Adresse IP', sig.signerIp || '—'],
        ];
    for (const [k, v] of meta) {
      doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.gray).text(`${k} : `, rX, ry, { width: rW, continued: true });
      doc.font(fontNames.bold).fillColor(colors.dark).text(v, { width: rW });
      ry += 11;
    }
    if (sig.signerUserAgent) {
      doc.font(fontNames.regular).fontSize(5.5).fillColor(colors.lightGray).text(sig.signerUserAgent.slice(0, 70), rX, ry, { width: rW, lineBreak: false });
    }

    doc.y = cardY + cardH + 8;
  }

  // Sceau d'intégrité
  doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.lightGray);
  doc.text(
    "L'intégrité de ce document est scellée par une empreinte numérique SHA-256 conservée dans le journal d'audit du système. Toute modification ultérieure du fichier invaliderait cette empreinte.",
    leftX, doc.y + 2, { width: pageWidth, align: 'left' },
  );
}
