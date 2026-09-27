import type { BonDetail, BonItOnlyField, PdfSnapshotInfo, SafeSignature } from '@/contracts/bons';
import type { PdfSnapshotType } from '@/contracts/common';
import { DOCUMENT_LABELS, PDF_SNAPSHOT_LABELS, SIGNATURE_TYPE_LABELS } from '@/domain/labels';

/** Fiche d'un bon vue par son titulaire : sans rien de réservé à l'IT. */
export type CollaboratorBon = Omit<BonDetail, BonItOnlyField>;

/** Un document final téléchargeable, nommé pour le collaborateur. */
export interface CollaboratorDocument {
  /** Identifiant du document : l'ouvre tel qu'il a été signé. */
  id: string;
  type: PdfSnapshotType;
  label: string;
  createdAt: string;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Documents que le collaborateur peut garder (R-092) : jamais les versions
 *  intermédiaires signées par l'IT seule. */
const COLLABORATOR_DOCUMENT_LABELS: Partial<Record<PdfSnapshotType, string>> = {
  signature_collab_mise_disposition: `${capitalize(DOCUMENT_LABELS.mise_disposition)} signé`,
  signature_collab_restitution: `${capitalize(DOCUMENT_LABELS.restitution)} signé`,
  cloture_equipements_manquants: PDF_SNAPSHOT_LABELS.cloture_equipements_manquants,
  avenant_equipement_retrouve: PDF_SNAPSHOT_LABELS.avenant_equipement_retrouve,
  remise_sans_signature: PDF_SNAPSHOT_LABELS.remise_sans_signature,
  cloture_sans_signature: PDF_SNAPSHOT_LABELS.cloture_sans_signature,
};

/** Le PV émis, signé par l'IT seule, précède le PV signé : version intermédiaire. */
function isItOnlyPv(snap: PdfSnapshotInfo): boolean {
  return snap.type === 'cloture_equipements_manquants' && snap.signatureType === 'it_cachet';
}

/**
 * Tous les documents finaux, dans l'ordre : chaque restitution signée a le
 * sien (jamais écrasé), avec sa propre date et son rang quand le même
 * document revient (« Bon de restitution signé (1 sur 2) »).
 */
export function collaboratorDocuments(snapshots: readonly PdfSnapshotInfo[]): CollaboratorDocument[] {
  const kept = snapshots.filter((snap) => COLLABORATOR_DOCUMENT_LABELS[snap.type] && !isItOnlyPv(snap));
  return kept.map((snap) => {
    const sameType = kept.filter((other) => other.type === snap.type);
    const rank = sameType.length > 1 ? ` (${sameType.indexOf(snap) + 1} sur ${sameType.length})` : '';
    return { id: snap.id, type: snap.type, label: `${COLLABORATOR_DOCUMENT_LABELS[snap.type]}${rank}`, createdAt: snap.createdAt };
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
