import type { BonForPdf, PdfSignature } from '../pdf-types';
import type { DocumentSignatures } from '../document-signatures';
import { PdfColorScheme, PdfFontsConfig } from '../pdf-template-config';
import { RenderFonts, drawSectionTitle, formatDateTime, formatOptionalText } from './layout';
import { SignerNames, signerName } from './signer-names';
import { inPersonRole } from './in-person';

// ─── CERTIFICAT DE SIGNATURE ÉLECTRONIQUE ─────────────────────────────────────
// Pièce probante annexée au document : pour chaque signature DE CE DOCUMENT,
// rôle, signataire, horodatage, IP, navigateur, mention « Lu et approuvé ».

export const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  it_cachet: 'Équipe informatique — signature IT',
  mise_disposition: 'Collaborateur — mise à disposition',
  restitution: 'Collaborateur — restitution',
  pv_cloture: 'Collaborateur — PV de non-restitution',
});

/** Document auquel se rapporte une signature IT (`Signature.pdfType`). */
const IT_DOCUMENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  mise_disposition: 'mise à disposition',
  restitution: 'restitution',
  pv_cloture: 'PV de non-restitution',
  avenant: 'avenant',
});

/** Libellé d'une signature dans le certificat : rôle + document (la signature
 *  IT précise son document via pdfType quand il est connu). */
export function certificateLabel(sig: { type: string; pdfType?: string | null }): string {
  const base = ROLE_LABELS[sig.type] ?? sig.type;
  const document = sig.type === 'it_cachet' && sig.pdfType ? IT_DOCUMENT_LABELS[sig.pdfType] : undefined;
  return document ? `${base} — ${document}` : base;
}

/** Une carte du certificat, prête à dessiner. */
export interface CertificateEntry {
  role: string;
  /** Mention sous le rôle (« Signature au guichet »), ou `null`. */
  badge: string | null;
  luApprouve: boolean;
  meta: [string, string][];
  userAgent: string | null;
}

function signedTime(sig: PdfSignature): number {
  return sig.signedAt ? new Date(sig.signedAt).getTime() : 0;
}

/**
 * Qui a signé. Au guichet, le compte connecté peut être celui du technicien
 * qui tient la tablette : le signataire reste le collaborateur, le technicien
 * est nommé comme présent (R-032). Un mandataire, lui, signe pour le compte du
 * collaborateur. Une signature IT n'est jamais « au guichet » : elle est
 * apposée dans l'application.
 */
function signerMeta(bon: BonForPdf, sig: PdfSignature, names: SignerNames): { badge: string | null; rows: [string, string][] } {
  const collabName = formatOptionalText(bon.collaborateur?.displayName);
  const account = formatOptionalText(sig.signerEmail);
  const accountName = signerName(names, sig.signerEmail);
  if (sig.type === 'it_cachet') {
    return { badge: null, rows: [['Signataire', accountName ?? account], ['Compte', account]] };
  }
  const role = inPersonRole(bon, sig);
  if (role === 'witness') {
    return {
      badge: 'Signature au guichet',
      rows: [['Signataire', collabName], ['En présence de', accountName ?? account], ['Compte utilisé', account]],
    };
  }
  if (role === 'proxy') {
    return {
      badge: 'Signature au guichet — mandataire',
      rows: [['Signataire', accountName ?? account], ['Pour le compte de', collabName], ['Compte utilisé', account]],
    };
  }
  return {
    badge: role === 'holder' ? 'Signature au guichet' : null,
    rows: [['Signataire', accountName ?? collabName], ['Compte', account]],
  };
}

/** Cartes du certificat : les signatures du document, dans l'ordre chronologique. */
export function buildCertificateEntries(
  bon: BonForPdf,
  selection: DocumentSignatures,
  names: SignerNames,
): CertificateEntry[] {
  return [selection.it, selection.collab]
    .filter((s): s is PdfSignature => !!s && s.signed && !!s.signedAt)
    .sort((a, b) => signedTime(a) - signedTime(b))
    .map((sig) => {
      const { badge, rows } = signerMeta(bon, sig, names);
      return {
        role: certificateLabel(sig),
        badge,
        // « Lu et approuvé » est la mention du collaborateur ; la signature IT
        // porte sa propre attestation dans la case du document.
        luApprouve: sig.type !== 'it_cachet' && !!sig.mentionLuApprouve,
        meta: [...rows, ['Horodatage', formatDateTime(sig.signedAt)], ['Adresse IP', sig.signerIp || '—']],
        userAgent: sig.signerUserAgent ?? null,
      };
    });
}

const CARD_TEXT_WIDTH_OFFSET = 232;
const META_COLUMN_WIDTH = 196;
const META_LINE_HEIGHT = 11;

function drawCertificateCard(
  doc: PDFKit.PDFDocument,
  entry: CertificateEntry,
  leftX: number,
  pageWidth: number,
  colors: PdfColorScheme,
  fontNames: RenderFonts,
): void {
  const cardY = doc.y;
  const cardH = Math.max(52, 16 + (entry.meta.length + 1) * META_LINE_HEIGHT);
  const textWidth = pageWidth - CARD_TEXT_WIDTH_OFFSET;
  doc.roundedRect(leftX, cardY, pageWidth, cardH, 8).lineWidth(0.5).fillAndStroke(colors.rowAlt, colors.border);

  // Pastille de rôle + « signé électroniquement »
  doc.circle(leftX + 14, cardY + 14, 2.6).fillColor('#16a34a').fill();
  // Le rôle peut tenir sur deux lignes : les mentions suivantes se placent dessous.
  doc.font(fontNames.bold).fontSize(8);
  const roleHeight = doc.heightOfString(entry.role, { width: textWidth });
  doc.fillColor(colors.dark).text(entry.role, leftX + 22, cardY + 10, { width: textWidth });
  const signedY = cardY + 12 + roleHeight;
  doc.font(fontNames.regular).fontSize(6.5).fillColor('#16a34a').text('SIGNÉ ÉLECTRONIQUEMENT', leftX + 22, signedY, { width: textWidth, characterSpacing: 0.4 });
  let leftY = signedY + 10;
  if (entry.badge) {
    doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.gray).text(entry.badge, leftX + 22, leftY, { width: textWidth });
    leftY += 9;
  }
  if (entry.luApprouve) {
    doc.font(fontNames.bold).fontSize(6.5).fillColor(colors.gray).text('« Lu et approuvé »', leftX + 22, leftY, { width: textWidth });
  }

  // Colonne droite : signataire, horodatage, IP, navigateur.
  const rX = leftX + pageWidth - 200;
  let ry = cardY + 8;
  for (const [k, v] of entry.meta) {
    doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.gray).text(`${k} : `, rX, ry, { width: META_COLUMN_WIDTH, continued: true });
    doc.font(fontNames.bold).fillColor(colors.dark).text(v, { width: META_COLUMN_WIDTH });
    ry += META_LINE_HEIGHT;
  }
  if (entry.userAgent) {
    doc.font(fontNames.regular).fontSize(5.5).fillColor(colors.lightGray).text(entry.userAgent.slice(0, 70), rX, ry, { width: META_COLUMN_WIDTH, lineBreak: false });
  }

  doc.y = cardY + cardH + 8;
}

/**
 * Annexe le certificat de signature électronique du document. C'est la pièce
 * probante d'une signature électronique : elle rend le PDF auto-portant en
 * cas de litige. Rien n'est dessiné si le document n'a encore aucune signature.
 */
export function drawCertificateSection(
  doc: PDFKit.PDFDocument,
  reference: string,
  entries: readonly CertificateEntry[],
  leftX: number,
  pageWidth: number,
  colors: PdfColorScheme,
  fonts: PdfFontsConfig,
  fontNames: RenderFonts,
): void {
  if (entries.length === 0) return;

  // Nouvelle page si l'espace restant est insuffisant
  const NEEDED = 90 + entries.length * 70;
  if (doc.y + NEEDED > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  } else {
    doc.y += 16;
  }

  drawSectionTitle(doc, leftX, 'CERTIFICAT DE SIGNATURE ÉLECTRONIQUE', pageWidth, colors, fontNames);
  doc.y += 6;
  doc.font(fontNames.regular).fontSize(fonts.labelSize).fillColor(colors.gray);
  doc.text(
    `Réf. ${reference} — Les signatures ci-dessous ont été recueillies électroniquement par l'application Bons IT pour ce document.`,
    leftX, doc.y, { width: pageWidth },
  );
  doc.y += 16;

  for (const entry of entries) drawCertificateCard(doc, entry, leftX, pageWidth, colors, fontNames);

  // Sceau d'intégrité
  doc.font(fontNames.regular).fontSize(6.5).fillColor(colors.lightGray);
  doc.text(
    "L'intégrité de ce document est scellée par une empreinte numérique SHA-256 conservée dans le journal d'audit du système. Toute modification ultérieure du fichier invaliderait cette empreinte.",
    leftX, doc.y + 2, { width: pageWidth, align: 'left' },
  );
}
