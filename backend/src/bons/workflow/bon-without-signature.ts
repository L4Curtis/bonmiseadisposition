import { BonStatus, SignatureInvalidationReason } from '@prisma/client';
import { DOMAIN_EVENTS } from '../../common/events';
import { WithoutSignatureAction } from '../bon-status';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed, requireReason, statusChangedMeanwhile } from './bon-guards';
import { writeAuditEntry } from '../../audit/audit-record';
import type { AuditAction } from '../../audit/audit-actions';

/**
 * Les deux gestes « sans signature », distincts (R-014) :
 *  - « Constater la remise sans signature » : Remise à signer → En cours. Le
 *    matériel est remis, le collaborateur n'a pas signé (injoignable) ;
 *  - « Clôturer sans signature » : restitution ou PV à signer → Clôturé.
 * Chacun a son motif (obligatoire), son entrée d'audit et son événement,
 * publié après la transaction : ses écouteurs (lot 2B) produisent le document
 * PDF du geste et l'email au collaborateur.
 */

interface GestureSpec {
  readonly action: WithoutSignatureAction;
  readonly auditAction: AuditAction;
  readonly invalidation: SignatureInvalidationReason;
}

const HANDOVER: GestureSpec = {
  action: 'handover_without_signature',
  auditAction: 'bon_handover_without_signature',
  invalidation: 'handover_without_signature',
};

const CLOSURE: GestureSpec = {
  action: 'closed_without_signature',
  auditAction: 'bon_closed_without_signature',
  invalidation: 'closed_without_signature',
};

/** Transition + motif + invalidation des liens, dans une seule transaction :
 *  une signature qui arriverait entre-temps perd la course proprement. */
async function applyGesture(
  ctx: BonsWorkflowContext,
  id: string,
  from: BonStatus,
  spec: GestureSpec,
  reason: string,
): Promise<void> {
  const now = new Date();
  const data =
    spec === HANDOVER
      ? { status: 'active' as const, handoverWithoutSignatureReason: reason, awaitingSince: null }
      : { status: 'archived' as const, archivedAt: now, closedWithoutSignatureReason: reason, awaitingSince: null };
  await ctx.prisma.$transaction(async (tx) => {
    const transition = await tx.bon.updateMany({ where: { id, status: from }, data });
    if (transition.count === 0) throw statusChangedMeanwhile();
    await tx.signature.updateMany({
      where: { bonId: id, signed: false, type: { not: 'it_cachet' }, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: spec.invalidation },
    });
  });
}

/** « Constater la remise sans signature ». */
export async function handoverWithoutSignature(ctx: BonsWorkflowContext, id: string, actorId: string, rawReason: string) {
  const reason = requireReason(rawReason, 'de la remise sans signature');
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'handover_without_signature');
  await applyGesture(ctx, id, bon.status, HANDOVER, reason);
  await writeAuditEntry(ctx.prisma, HANDOVER.auditAction, { actorId, bonId: id, details: { from: bon.status, reason } });
  await ctx.events.publish(DOMAIN_EVENTS.bonHandoverWithoutSignature, {
    bonId: id, bonReference: bon.reference, actorId, occurredAt: new Date(), reason,
  });
}

/** « Clôturer sans signature ». */
export async function closeWithoutSignature(ctx: BonsWorkflowContext, id: string, actorId: string, rawReason: string) {
  const reason = requireReason(rawReason, 'de la clôture sans signature');
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'close_without_signature');
  await applyGesture(ctx, id, bon.status, CLOSURE, reason);
  await writeAuditEntry(ctx.prisma, CLOSURE.auditAction, { actorId, bonId: id, details: { from: bon.status, reason } });
  await ctx.events.publish(DOMAIN_EVENTS.bonClosedWithoutSignature, {
    bonId: id, bonReference: bon.reference, actorId, occurredAt: new Date(), previousStatus: bon.status, reason,
  });
}

/** Ancienne route « clôture unilatérale » : choisit le geste selon le statut. */
export async function closeUnilaterally(ctx: BonsWorkflowContext, id: string, actorId: string, reason: string) {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  return bon.status === 'sent_mise_dispo'
    ? handoverWithoutSignature(ctx, id, actorId, reason)
    : closeWithoutSignature(ctx, id, actorId, reason);
}
