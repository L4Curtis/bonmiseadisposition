// ─── Pure helpers derived from a signature `type` ──────────────────────────
// Centralise une logique auparavant dupliquée entre l'écran "signé à
// l'instant" et le rendu principal de la page de signature.

export function signatureTypeLabel(type: string | undefined): string {
  if (type === 'pv_cloture') return 'procès-verbal d\'équipements non restitués';
  if (type === 'restitution') return 'restitution';
  return 'mise à disposition';
}

export function signatureDocLabel(type: string | undefined): string {
  return type === 'pv_cloture' ? 'Le procès-verbal' : `Le bon de ${signatureTypeLabel(type)}`;
}

/** Étape du snapshot PDF généré de façon synchrone à la signature —
 *  permet un téléchargement immédiat du document qui vient d'être signé. */
export function signatureStageForType(type: string | undefined): string {
  if (type === 'restitution') return 'signature_collab_restitution';
  if (type === 'pv_cloture') return 'cloture_equipements_manquants';
  return 'signature_collab_mise_disposition';
}
