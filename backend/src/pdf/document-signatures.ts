import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';
import type { PdfSignature } from './pdf-types';
import type { PdfDocumentType } from './render/layout';

export type { PdfSignature } from './pdf-types';

/**
 * Signatures qui appartiennent à UN document du bon (R-030).
 *
 * Un bon réunit les signatures de plusieurs documents : remise, une ou
 * plusieurs restitutions, PV de non-restitution, avenant. Le PDF d'un
 * document ne doit montrer que les siennes : la case IT porte le technicien
 * qui a signé CE document, la case collaborateur la signature de CE document
 * (avec sa date), et le certificat ne liste qu'elles.
 */

/** `document` : la signature du collaborateur pour ce document, s'il l'a
 *  déjà signé ; `none` : document de l'IT seule (signature IT avant envoi,
 *  avenant, geste sans signature). */
export type CollabSignatureMode = 'document' | 'none';

export interface DocumentSignatures {
  readonly it: PdfSignature | null;
  readonly collab: PdfSignature | null;
}

/** Signature du collaborateur attendue pour chaque document. */
const COLLAB_SIGNATURE_TYPE: Readonly<Record<PdfDocumentType, string | null>> = Object.freeze({
  mise_disposition: 'mise_disposition',
  restitution: 'restitution',
  cloture: 'pv_cloture',
  avenant: null,
});

/** Valeur de `Signature.pdfType` d'une signature IT, par document. */
export const IT_SIGNATURE_PDF_TYPE: Readonly<Record<PdfDocumentType, string>> = Object.freeze({
  mise_disposition: 'mise_disposition',
  restitution: 'restitution',
  cloture: 'pv_cloture',
  avenant: 'avenant',
});

function timeOf(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Signature signée et datée, avec sa date en millisecondes. */
interface DatedSignature {
  readonly signature: PdfSignature;
  readonly time: number;
}

/** Signatures signées d'un type, du plus ancien au plus récent. Une signature
 *  IT invalidée (bon modifié après coup : une nouvelle signature IT a été
 *  exigée) ne vaut plus pour le document. */
function datedSignatures(signatures: readonly PdfSignature[], type: string): DatedSignature[] {
  return signatures
    .filter((s) => s.type === type && s.signed && !s.invalidatedAt)
    .map((signature) => ({ signature, time: timeOf(signature.signedAt) }))
    .filter((d): d is DatedSignature => d.time !== null)
    .sort((a, b) => a.time - b.time);
}

function latest(list: readonly DatedSignature[]): DatedSignature | null {
  return list.length > 0 ? list[list.length - 1] : null;
}

/** Lien encore en attente (ni signé, ni invalidé volontairement). */
function isAwaiting(signature: PdfSignature): boolean {
  if (signature.signed || signature.invalidatedAt) return false;
  const expiresAt = timeOf(signature.tokenExpiresAt);
  return expiresAt === null || expiresAt > INVALIDATED_TOKEN_SENTINEL.getTime();
}

/**
 * Dernière signature du collaborateur pour ce document, sauf si un lien plus
 * récent du même document attend sa signature : le document en cours est
 * alors le nouveau (seconde restitution, PV réémis), encore non signé.
 */
function selectCollab(signatures: readonly PdfSignature[], documentType: PdfDocumentType): DatedSignature | null {
  const type = COLLAB_SIGNATURE_TYPE[documentType];
  if (!type) return null;
  const found = latest(datedSignatures(signatures, type));
  if (!found) return null;
  const newerRequest = signatures.some((s) => {
    const createdAt = timeOf(s.createdAt);
    return s.type === type && isAwaiting(s) && createdAt !== null && createdAt > found.time;
  });
  return newerRequest ? null : found;
}

/**
 * Signature IT antérieure à `pdfType` : rattachée à la remise si elle précède
 * la signature de remise du collaborateur, aux étapes suivantes sinon. Ne
 * concerne que des données d'avant la vague 2 (aucune en production).
 */
function matchesLegacyPhase(it: DatedSignature, documentType: PdfDocumentType, signatures: readonly PdfSignature[]): boolean {
  const firstHandover = datedSignatures(signatures, 'mise_disposition')[0] ?? null;
  if (documentType === 'mise_disposition') return firstHandover === null || it.time <= firstHandover.time;
  return firstHandover !== null && it.time > firstHandover.time;
}

function selectIt(
  signatures: readonly PdfSignature[],
  documentType: PdfDocumentType,
  collab: DatedSignature | null,
): PdfSignature | null {
  const limit = collab?.time ?? Number.POSITIVE_INFINITY;
  const candidates = datedSignatures(signatures, 'it_cachet').filter((d) => d.time <= limit);
  const exact = candidates.filter((d) => d.signature.pdfType === IT_SIGNATURE_PDF_TYPE[documentType]);
  const chosen =
    latest(exact) ??
    latest(candidates.filter((d) => !d.signature.pdfType && matchesLegacyPhase(d, documentType, signatures)));
  return chosen?.signature ?? null;
}

/** Signature IT et signature du collaborateur du document demandé. */
export function selectDocumentSignatures(
  signatures: readonly PdfSignature[],
  documentType: PdfDocumentType,
  collabMode: CollabSignatureMode = 'document',
): DocumentSignatures {
  const collab = collabMode === 'document' ? selectCollab(signatures, documentType) : null;
  return Object.freeze({
    it: selectIt(signatures, documentType, collab),
    collab: collab?.signature ?? null,
  });
}
