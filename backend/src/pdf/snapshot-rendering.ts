import type { PdfSnapshotType } from '@prisma/client';
import type { BonForPdf, WithoutSignatureNotice } from './pdf-types';
import type { CollabSignatureMode } from './document-signatures';
import type { PdfDocumentType } from './render/layout';

/**
 * Ce qu'imprime chaque type de document enregistré (PdfSnapshotType) : le
 * modèle de document, et si la case du collaborateur porte sa signature, rien,
 * ou le constat d'un geste sans signature (R-031).
 */

export interface DocumentRendering {
  documentType: PdfDocumentType;
  collab: CollabSignatureMode;
  /** Geste sans signature : remplace la signature du collaborateur. */
  notice?: WithoutSignatureNotice;
  /** Complément du titre (« CLÔTURÉ SANS SIGNATURE »). */
  titleSuffix?: string;
}

export interface ResolvedSnapshot {
  /** Type sous lequel le document est rangé (peut différer de celui demandé :
   *  un geste sans signature n'est jamais rangé sous « signature du collaborateur »). */
  snapshotType: PdfSnapshotType;
  rendering: DocumentRendering;
}

const WITHOUT_SIGNATURE_TITLES: Readonly<Record<WithoutSignatureNotice['kind'], string>> = Object.freeze({
  handover: 'REMISE CONSTATÉE SANS SIGNATURE',
  closure: 'CLÔTURÉ SANS SIGNATURE',
});

/** Types dont le document porte la signature du collaborateur. */
export const COLLAB_SIGNED_SNAPSHOT_TYPES: readonly PdfSnapshotType[] = Object.freeze([
  'signature_collab_mise_disposition',
  'signature_collab_restitution',
]);

const FIXED_RENDERINGS: Readonly<Partial<Record<PdfSnapshotType, DocumentRendering>>> = Object.freeze({
  signature_it_mise_disposition: { documentType: 'mise_disposition', collab: 'none' },
  signature_collab_mise_disposition: { documentType: 'mise_disposition', collab: 'document' },
  signature_it_restitution: { documentType: 'restitution', collab: 'none' },
  signature_collab_restitution: { documentType: 'restitution', collab: 'document' },
  // PV : brouillon de l'IT à l'émission, puis co-signé ; la case se remplit
  // quand le collaborateur a signé CE PV.
  cloture_equipements_manquants: { documentType: 'cloture', collab: 'document' },
  avenant_equipement_retrouve: { documentType: 'avenant', collab: 'none' },
});

/** Document d'une clôture sans signature : le PV s'il reste des équipements
 *  non restitués, sinon la restitution. */
export function closureDocumentType(bon: Pick<BonForPdf, 'equipments'>): PdfDocumentType {
  return bon.equipments.some((eq) => eq.notReturned) ? 'cloture' : 'restitution';
}

function withoutSignatureRendering(bon: BonForPdf, notice: WithoutSignatureNotice): DocumentRendering {
  return {
    documentType: notice.kind === 'handover' ? 'mise_disposition' : closureDocumentType(bon),
    collab: 'none',
    notice,
    titleSuffix: WITHOUT_SIGNATURE_TITLES[notice.kind],
  };
}

/**
 * Forme « texte libre » d'un geste sans signature (`_unilateralNote`, déjà
 * rédigé : motif, technicien, date), avec le type demandé. Le document est rangé sous le type
 * « sans signature » correspondant, jamais sous « signature du collaborateur ».
 */
const HANDOVER_TYPES: readonly string[] = ['signature_collab_mise_disposition', 'remise_sans_signature'];

function legacyNotice(bon: BonForPdf, snapshotType: string): WithoutSignatureNotice | null {
  if (!bon._unilateralNote) return null;
  const kind = HANDOVER_TYPES.includes(snapshotType) ? 'handover' : 'closure';
  return { kind, reason: bon._unilateralNote, actorName: '', at: '' };
}

export function resolveSnapshotRendering(bon: BonForPdf, requestedType: string): ResolvedSnapshot {
  const notice = bon._withoutSignature ?? legacyNotice(bon, requestedType);
  if (notice) {
    return {
      snapshotType: notice.kind === 'handover' ? 'remise_sans_signature' : 'cloture_sans_signature',
      rendering: withoutSignatureRendering(bon, notice),
    };
  }
  const fixed = FIXED_RENDERINGS[requestedType as PdfSnapshotType];
  if (!fixed) {
    throw new Error(
      `Document « ${requestedType} » sans constat : un document sans signature exige le motif et le technicien (bon ${bon.reference})`,
    );
  }
  return { snapshotType: requestedType as PdfSnapshotType, rendering: fixed };
}
