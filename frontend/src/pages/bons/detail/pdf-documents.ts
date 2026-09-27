import type { PdfSnapshotInfo } from '@/contracts/bons';
import { LINK_INVALIDATION_LABELS, PDF_SNAPSHOT_LABELS, labelOrKey } from '@/domain/labels';

/**
 * Lignes de la liste « Documents PDF » de la fiche IT. Le serveur garde un
 * document par signature, jamais écrasé : deux restitutions, ou la remise
 * signée de nouveau après une modification, donnent deux lignes, chacune avec
 * sa date, son empreinte et son rang (« 1 sur 2 »). La version en vigueur est
 * signalée ; une version qui ne vaut plus dit pourquoi.
 */
export interface DocumentLine {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  sha256: string | null;
  /** « En vigueur », « Ne vaut plus — motif », ou `null` (type unique). */
  status: string | null;
  superseded: boolean;
}

/** PV : la version signée par l'IT seule (émise) et celle signée par le collaborateur. */
function pvVariant(snap: PdfSnapshotInfo): string {
  if (snap.type !== 'cloture_equipements_manquants' || !snap.signatureType) return '';
  return snap.signatureType === 'it_cachet' ? ' — signé par l’IT' : ' — signé par le collaborateur';
}

function title(snap: PdfSnapshotInfo): string {
  const base = labelOrKey(PDF_SNAPSHOT_LABELS, snap.type);
  const rank = snap.sequenceCount > 1 ? ` (${snap.sequence} sur ${snap.sequenceCount})` : '';
  return `${base}${pvVariant(snap)}${rank}`;
}

function status(snap: PdfSnapshotInfo): string | null {
  if (snap.supersededReason) return `Ne vaut plus — ${labelOrKey(LINK_INVALIDATION_LABELS, snap.supersededReason)}`;
  if (snap.supersededAt) return 'Ne vaut plus';
  return snap.sequenceCount > 1 && snap.latest ? 'En vigueur' : null;
}

export function documentLines(snapshots: readonly PdfSnapshotInfo[]): DocumentLine[] {
  return snapshots.map((snap) => ({
    id: snap.id,
    title: title(snap),
    filename: snap.filename,
    createdAt: snap.createdAt,
    sha256: snap.sha256,
    status: status(snap),
    superseded: snap.supersededAt !== null,
  }));
}
