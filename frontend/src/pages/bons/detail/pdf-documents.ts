import type { BonDetail, PdfSnapshotInfo, SafeSignature } from '@/contracts/bons';
import { LINK_INVALIDATION_LABELS, PDF_SNAPSHOT_LABELS, TERMS, labelOrKey } from '@/domain/labels';

/**
 * Lignes de la liste « Documents PDF » de la fiche IT. Le serveur garde un
 * document par signature, jamais écrasé : deux restitutions, ou la remise
 * signée de nouveau après une modification, donnent deux lignes, chacune avec
 * sa date, son empreinte et son rang dans sa série (« 1 sur 2 »). Chaque
 * document dit s'il est en vigueur ou, sinon, pourquoi il ne vaut plus.
 */
export interface DocumentLine {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  sha256: string | null;
  /** « En vigueur », « Ne vaut plus — motif », ou pour le PV prêt, quand il partira. */
  status: string;
  superseded: boolean;
}

/**
 * Titre d'un document : le document (remise, restitution, PV de
 * non-restitution) puis son signataire, au vocabulaire du lexique (« remise »,
 * « signature IT »). Les PDF et les emails gardent leur titre légal (« Bon de
 * mise à disposition ») : seule la liste de la fiche parle ainsi.
 */
const DOCUMENT_TITLES: Readonly<Record<string, string>> = {
  signature_it_mise_disposition: 'Remise — signature IT',
  signature_collab_mise_disposition: 'Remise — signée par le collaborateur',
  signature_it_restitution: 'Restitution — signature IT',
  signature_collab_restitution: 'Restitution — signée par le collaborateur',
};

/** PV : un seul type, deux versions (signée par l'IT seule, puis par le collaborateur). */
function pvTitle(snap: PdfSnapshotInfo): string {
  if (snap.signatureType === 'it_cachet') return `${TERMS.nonReturnReport} — signature IT`;
  if (snap.signatureType) return `${TERMS.nonReturnReport} — signé par le collaborateur`;
  return TERMS.nonReturnReport;
}

/** Nom d'un type de document seul (documents manquants), au même vocabulaire. */
export function documentTypeTitle(type: string): string {
  if (type === 'cloture_equipements_manquants') return TERMS.nonReturnReport;
  return DOCUMENT_TITLES[type] ?? labelOrKey(PDF_SNAPSHOT_LABELS, type);
}

function title(snap: PdfSnapshotInfo): string {
  const base = snap.type === 'cloture_equipements_manquants'
    ? pvTitle(snap)
    : DOCUMENT_TITLES[snap.type] ?? labelOrKey(PDF_SNAPSHOT_LABELS, snap.type);
  // Le rang est compté par le serveur dans la série du document (même type,
  // même signataire) : le PV de l'IT et celui du collaborateur ne se mêlent pas.
  const rank = snap.sequenceCount > 1 ? ` (${snap.sequence} sur ${snap.sequenceCount})` : '';
  return `${base}${rank}`;
}

/** Une seule règle, sur tous les bons : un document vaut tant que sa signature
 *  n'a pas été retirée ; sinon « Ne vaut plus », avec le motif. Chaque
 *  restitution a son propre document : la première reste en vigueur quand la
 *  seconde arrive. */
function status(snap: PdfSnapshotInfo): string {
  if (snap.supersededReason) return `Ne vaut plus — ${labelOrKey(LINK_INVALIDATION_LABELS, snap.supersededReason)}`;
  if (snap.supersededAt) return 'Ne vaut plus';
  return 'En vigueur';
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

/** PV prêt : certifié par la signature IT, il n'est pas encore émis. */
export interface ReadyPv {
  signedAt: string;
  /** Technicien qui a signé le PV (son nom, à défaut son adresse). */
  signerName: string;
}

/** Dernière signature IT valable du PV de non-restitution. */
export function pvItSignature(signatures: readonly SafeSignature[]): SafeSignature | null {
  const valid = signatures
    .filter((s) => s.type === 'it_cachet' && s.signed && s.pdfType === 'pv_cloture' && !s.invalidatedAt && s.signedAt)
    .sort((a, b) => new Date(a.signedAt!).getTime() - new Date(b.signedAt!).getTime());
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

/**
 * « Perte déclarée » : le PV de non-restitution est déjà certifié par la
 * signature IT, mais il ne partira qu'au retour des équipements encore
 * dehors. Il n'est pas encore un document enregistré ; la fiche le propose
 * quand même au téléchargement (généré par le serveur à la demande).
 */
export function readyPvOf(bon: Pick<BonDetail, 'subStatus' | 'signatures'>): ReadyPv | null {
  if (bon.subStatus !== 'loss_declared') return null;
  const signature = pvItSignature(bon.signatures ?? []);
  if (!signature?.signedAt) return null;
  return { signedAt: signature.signedAt, signerName: signature.signerName ?? signature.signerEmail ?? 'l’équipe informatique' };
}
