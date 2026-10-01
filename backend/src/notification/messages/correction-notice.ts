import type { LinkCorrection } from '../../common/link-correction';

/**
 * Mention d'un document corrigé dans l'email qui porte son nouveau lien : le
 * collaborateur qui a contesté, ou dont le bon a été modifié, sait que ce
 * lien remplace le précédent et pourquoi (constat R5 n° 1).
 */

export type CorrectedDocument = 'mise_disposition' | 'restitution' | 'pv_cloture';

/** Ce qui a changé, en une phrase. */
function correctionSentence(correction: LinkCorrection, document: CorrectedDocument): string {
  if (correction === 'modified') return 'Ce bon a été modifié depuis le précédent envoi.';
  const what = document === 'pv_cloture' ? 'le PV de non-restitution a été corrigé' : 'la restitution a été corrigée';
  if (correction === 'contested') return `Suite à votre contestation, ${what}.`;
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} par l’équipe informatique.`;
}

/** Encadré HTML de la mention ; chaîne vide sans correction. */
export function buildCorrectionNotice(correction: LinkCorrection | null, document: CorrectedDocument): string {
  if (!correction) return '';
  const sentence = correctionSentence(correction, document);
  return `<p style="margin:0 0 20px;font-size:14px;color:#92400e;line-height:1.6;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px"><strong>${sentence}</strong> Ce lien remplace le précédent, qui n’est plus valable.</p>`;
}

/** Titre du document dans le sujet de l'email, corrigé ou non. */
export function correctedSubjectLabel(correction: LinkCorrection | null, document: CorrectedDocument): string {
  if (document === 'pv_cloture') return correction ? 'PV de non-restitution corrigé à signer' : 'PV de non-restitution à signer';
  if (document === 'restitution') return correction ? 'Restitution corrigée à signer' : 'Bon de restitution à signer';
  return correction ? 'Bon de mise à disposition modifié à signer' : 'Bon de mise à disposition à signer';
}
