import { signatureStepInSentence, signedDocumentPhrase } from '@/domain/labels';

// ─── Pure helpers derived from a signature `type` ──────────────────────────
// Les mots viennent du lexique (`@/domain/labels`), partagé avec le portail.

export const signatureTypeLabel = signatureStepInSentence;

export const signatureDocLabel = signedDocumentPhrase;

/** Étape du snapshot PDF généré de façon synchrone à la signature —
 *  permet un téléchargement immédiat du document qui vient d'être signé. */
export function signatureStageForType(type: string | undefined): string {
  if (type === 'restitution') return 'signature_collab_restitution';
  if (type === 'pv_cloture') return 'cloture_equipements_manquants';
  return 'signature_collab_mise_disposition';
}
