import type { BonStatus, ContestationOutcome, SignatureType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { BonContestationNotice, BonLinkRequest, LinkSignatureType } from '../contracts/bons';
import { LINK_REQUEST_AUDIT_ACTION } from '../signature/link-request';
import type { FactsBon, FactsSignature } from './workflow/bon-facts';
import { computeBonFacts, latestUnsignedLink } from './workflow/bon-facts';
import { pendingDocument } from './workflow/state-machine';

/**
 * Rappels de la fiche IT que ni les équipements ni les signatures ne disent :
 *  - la contestation en cours (bon « Contesté ») ou la correction qu'une
 *    contestation Fondée sur une restitution ou un PV a laissée à faire ;
 *  - la demande de nouveau lien du collaborateur (lien expiré), tant que l'IT
 *    n'a pas renvoyé le document.
 * Réservés à l'IT : jamais calculés pour le collaborateur titulaire.
 */

/** Gestes du journal d'audit qui corrigent un document rouvert. */
export const CORRECTION_AUDIT_ACTIONS: readonly string[] = Object.freeze([
  'return_marking_undone',
  'restitution_initiated',
  'declare_not_returned',
  'mark_found',
]);

/** Contestation pas encore tranchée : nouvelle, ou prise en charge. */
const UNDECIDED_STATUSES: readonly string[] = ['open', 'in_review'];

/** Documents qu'une contestation Fondée fait corriger sur le bon lui-même. */
const REOPENED_DOCUMENTS: readonly SignatureType[] = ['restitution', 'pv_cloture'];

/** Contestation telle que la lit la fiche. */
export interface ContestationRow {
  readonly id: string;
  readonly message: string;
  readonly createdAt: Date;
  readonly status: string;
  readonly outcome: ContestationOutcome | null;
  readonly contestedDocument: SignatureType | null;
  readonly resolvedAt: Date | null;
  readonly resolutionMessage: string | null;
  readonly reviewedBy: { readonly id: string; readonly displayName: string } | null;
}

/** Ce que la fiche sait déjà du bon, pour situer la contestation. */
export interface NoticeBonState {
  readonly status: BonStatus;
  readonly pendingDocument: LinkSignatureType | null;
  readonly signatures: readonly FactsSignature[];
}

const time = (value: Date | string | null | undefined): number => (value ? new Date(value).getTime() : 0);

/** Dernier geste qui a fait avancer le document depuis `since` : nouvelle
 *  signature IT, nouveau lien, ou geste de correction du journal. */
export function lastProgressAt(
  signatures: readonly FactsSignature[],
  correctionDates: readonly Date[],
): number {
  const fromSignatures = signatures.map((s) => (s.type === 'it_cachet' ? (s.signed ? time(s.signedAt) : 0) : time(s.createdAt)));
  return Math.max(0, ...fromSignatures, ...correctionDates.map((d) => d.getTime()));
}

function toNotice(row: ContestationRow, stage: BonContestationNotice['stage']): BonContestationNotice {
  const document = row.contestedDocument && row.contestedDocument !== 'it_cachet' ? row.contestedDocument : null;
  return {
    id: row.id,
    stage,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    contestedDocument: document,
    reviewedBy: row.reviewedBy ? { id: row.reviewedBy.id, displayName: row.reviewedBy.displayName } : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolutionMessage: row.resolutionMessage,
  };
}

/**
 * Contestation à rappeler, ou null :
 *  - bon « Contesté » et contestation pas encore tranchée (nouvelle ou prise
 *    en charge) : étape `open` ;
 *  - dernière contestation Fondée sur le document qui attend encore sa
 *    signature, sans aucun geste depuis la décision : étape `correction`.
 */
export function contestationNotice(
  row: ContestationRow | null,
  bon: NoticeBonState,
  correctionDates: readonly Date[],
): BonContestationNotice | null {
  if (!row) return null;
  if (bon.status === 'contested') return UNDECIDED_STATUSES.includes(row.status) ? toNotice(row, 'open') : null;
  if (row.outcome !== 'founded' || !row.resolvedAt || !row.contestedDocument) return null;
  if (!REOPENED_DOCUMENTS.includes(row.contestedDocument) || row.contestedDocument !== bon.pendingDocument) return null;
  const corrected = lastProgressAt(bon.signatures, correctionDates) > row.resolvedAt.getTime();
  return corrected ? null : toNotice(row, 'correction');
}

/** Demande de nouveau lien postérieure au dernier lien du document en attente. */
export function linkRequestNotice(
  requestedAt: Date | null,
  bon: NoticeBonState,
): BonLinkRequest | null {
  if (!requestedAt || !bon.pendingDocument) return null;
  const latest = latestUnsignedLink(bon.signatures, bon.pendingDocument);
  if (latest && time(latest.createdAt) > requestedAt.getTime()) return null;
  return { requestedAt: requestedAt.toISOString(), documentType: bon.pendingDocument };
}

/** Rappels de la fiche IT d'un bon. */
export interface BonItNotices {
  readonly contestation: BonContestationNotice | null;
  readonly linkRequest: BonLinkRequest | null;
}

const CONTESTATION_SELECT = {
  id: true,
  message: true,
  createdAt: true,
  status: true,
  outcome: true,
  contestedDocument: true,
  resolvedAt: true,
  resolutionMessage: true,
  reviewedBy: { select: { id: true, displayName: true } },
} as const;

/** Lit la dernière contestation et les gestes utiles, puis calcule les rappels. */
export async function loadBonItNotices(
  prisma: PrismaService,
  row: FactsBon & { readonly id: string },
): Promise<BonItNotices> {
  const bonId = row.id;
  const bon: NoticeBonState = {
    status: row.status,
    pendingDocument: pendingDocument(computeBonFacts(row)),
    signatures: row.signatures,
  };
  const [contestation, lastRequest] = await Promise.all([
    prisma.contestation.findFirst({ where: { bonId }, orderBy: { createdAt: 'desc' }, select: CONTESTATION_SELECT }),
    bon.pendingDocument
      ? prisma.auditLog.findFirst({
          where: { bonId, action: LINK_REQUEST_AUDIT_ACTION },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  const since = contestation?.resolvedAt ?? null;
  const corrections = since && bon.status !== 'contested'
    ? await prisma.auditLog.findMany({
        where: { bonId, action: { in: [...CORRECTION_AUDIT_ACTIONS] }, createdAt: { gt: since } },
        select: { createdAt: true },
      })
    : [];
  return {
    contestation: contestationNotice(contestation, bon, corrections.map((c) => c.createdAt)),
    linkRequest: linkRequestNotice(lastRequest?.createdAt ?? null, bon),
  };
}
