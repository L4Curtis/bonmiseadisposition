import { RESTITUTION_PHASE_BON_STATUSES, isBonStatusIn } from './bon-status';

/**
 * GET /bons/:id/pdf-snapshots/missing — calcule les types de snapshot PDF
 * attendus (une signature signée existe) mais absents de PdfSnapshot, ex.
 * échec silencieux d'un generateAndSave passé (cf. audit pdf_snapshot_failed).
 *
 * Extrait de BonsController.getMissingPdfSnapshots sans changement de
 * comportement — fonction pure, sans accès base de données.
 */
export function computeMissingPdfSnapshotTypes(
  signedSignatures: { type: string; pdfType: string | null }[],
  existingTypes: Set<string>,
  bonStatus: string,
): string[] {
  const expectedTypes = new Set<string>();
  for (const sig of signedSignatures) {
    if (sig.type === 'mise_disposition') expectedTypes.add('signature_collab_mise_disposition');
    else if (sig.type === 'restitution') expectedTypes.add('signature_collab_restitution');
    else if (sig.type === 'pv_cloture') expectedTypes.add('cloture_equipements_manquants');
    else if (sig.type === 'it_cachet') {
      // pdfType est renseigné par le flux récent (signItCachet) ; pour un
      // enregistrement plus ancien sans pdfType, on déduit depuis le statut
      // courant du bon (même heuristique que signItCachet).
      const isRestitution =
        sig.pdfType === 'restitution' ||
        (sig.pdfType == null && (isBonStatusIn(bonStatus, RESTITUTION_PHASE_BON_STATUSES) || bonStatus === 'archived'));
      expectedTypes.add(isRestitution ? 'signature_it_restitution' : 'signature_it_mise_disposition');
    }
  }

  return [...expectedTypes].filter((type) => !existingTypes.has(type));
}
