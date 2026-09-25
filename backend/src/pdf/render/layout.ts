import { bonStatusLabel } from '../../bons/bon-status';
import { PARIS_TIME_ZONE, formatParisDate } from '../../common/dates/paris';
import { PdfColorScheme } from '../pdf-template-config';

// ─── Mise en page partagée ────────────────────────────────────────────────────
// Constantes, types et helpers texte/police utilisés par tous les modules de
// rendu PDFKit (`pdf/render/*`). Aucune dépendance à l'instance PdfService :
// les noms de police (dépendants de la disponibilité des polices Unicode
// embarquées) sont injectés explicitement via `RenderFonts`.

/** Types de document PDF générés par PdfService. */
export type PdfDocumentType = 'mise_disposition' | 'restitution' | 'cloture' | 'avenant';

/** Noms de police (corps + gras) à utiliser pour un rendu donné. */
export interface RenderFonts {
  regular: string;
  bold: string;
}

/** Date courte (jj/mm/aaaa, heure de Paris) — utilisée dans tout le
 *  document ; « — » pour une date absente. */
export function formatDate(date: Date | string | null): string {
  return formatParisDate(date, '—');
}

/**
 * Texte optionnel affiché dans les cases d'information du PDF (ex : email du
 * collaborateur) : « — » pour une valeur absente, vide ou blanche — jamais
 * "null"/"undefined" ni une ligne vide disgracieuse. Un collaborateur créé
 * manuellement (compagnon de chantier) n'a par exemple pas d'adresse email.
 */
export function formatOptionalText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

/** Horodatage complet (date + heure + fuseau) pour le certificat de preuve. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: PARIS_TIME_ZONE, timeZoneName: 'short',
  });
}

/** Libellé d'un statut de bon (vocabulaire commun, voir bons/bon-status.ts). */
export function getStatusLabel(status: string): string {
  return bonStatusLabel(status);
}

/** Titre de section souligné (bandeau fin coloré) — utilisé par toutes les
 *  sections du document (tableau, signatures, certificat…). */
export function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  x: number,
  title: string,
  width: number,
  colors: PdfColorScheme,
  fonts: RenderFonts,
): void {
  doc.font(fonts.bold).fontSize(8).fillColor(colors.primary).text(title, x, doc.y);
  doc.y += 2;
  doc.moveTo(x, doc.y).lineTo(x + width, doc.y).lineWidth(1.5).strokeColor('#F2DAD7').stroke();
  doc.y += 4;
}
