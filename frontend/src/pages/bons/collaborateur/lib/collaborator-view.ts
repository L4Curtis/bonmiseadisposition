import type { BonDetail, BonItOnlyField, PdfSnapshotInfo, SafeSignature } from '@/contracts/bons';
import type { PdfSnapshotType } from '@/contracts/common';
import { DOCUMENT_LABELS, PDF_SNAPSHOT_LABELS, SIGNATURE_TYPE_LABELS } from '@/domain/labels';

/** Fiche d'un bon vue par son titulaire : sans rien de réservé à l'IT. */
export type CollaboratorBon = Omit<BonDetail, BonItOnlyField>;

/** Un document final téléchargeable, nommé pour le collaborateur. */
export interface CollaboratorDocument {
  type: PdfSnapshotType;
  label: string;
  createdAt: string;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Documents que le collaborateur peut garder, un par étape (R-092) : jamais
 *  les versions intermédiaires signées par l'IT seule. */
const COLLABORATOR_DOCUMENT_LABELS: Partial<Record<PdfSnapshotType, string>> = {
  signature_collab_mise_disposition: `${capitalize(DOCUMENT_LABELS.mise_disposition)} signé`,
  signature_collab_restitution: `${capitalize(DOCUMENT_LABELS.restitution)} signé`,
  cloture_equipements_manquants: PDF_SNAPSHOT_LABELS.cloture_equipements_manquants,
  avenant_equipement_retrouve: PDF_SNAPSHOT_LABELS.avenant_equipement_retrouve,
  remise_sans_signature: PDF_SNAPSHOT_LABELS.remise_sans_signature,
  cloture_sans_signature: PDF_SNAPSHOT_LABELS.cloture_sans_signature,
};

export function collaboratorDocuments(snapshots: readonly PdfSnapshotInfo[]): CollaboratorDocument[] {
  return snapshots.flatMap((snap) => {
    const label = COLLABORATOR_DOCUMENT_LABELS[snap.type];
    return label ? [{ type: snap.type, label, createdAt: snap.createdAt }] : [];
  });
}

/** Une signature du collaborateur, dans l'ordre où elles ont eu lieu. */
export interface CollaboratorSignature {
  id: string;
  label: string;
  signedAt: string;
  atCounter: boolean;
}

/** Signatures du collaborateur (jamais la signature IT), de la plus ancienne
 *  à la plus récente (R-032). */
export function collaboratorSignatures(signatures: readonly SafeSignature[]): CollaboratorSignature[] {
  return signatures
    .filter((s): s is SafeSignature & { signedAt: string } => s.type !== 'it_cachet' && s.signed && !!s.signedAt)
    .sort((a, b) => a.signedAt.localeCompare(b.signedAt))
    .map((s) => ({ id: s.id, label: SIGNATURE_TYPE_LABELS[s.type], signedAt: s.signedAt, atCounter: s.isInPerson }));
}
