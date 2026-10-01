import { DOMAIN_EVENTS } from '../../common/events';
import { CANCELLABLE_BON_STATUSES } from '../bon-status';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed, requireReason, statusChangedMeanwhile } from './bon-guards';
import { writeAuditEntry } from '../../audit/audit-record';

/** Motif enregistré pour un brouillon abandonné sans motif saisi. */
const DRAFT_ABANDONED = 'Brouillon abandonné';

/**
 * Annulation d'un bon (décision du 24/09) : possible tant que la remise n'est
 * pas signée, par tout technicien. Pour un bon déjà envoyé, le motif est
 * obligatoire : il est tracé dans l'audit et transmis au collaborateur par
 * l'écouteur de `bon.cancelled` (email du lot 2B). Les liens en attente sont
 * invalidés avec le motif « annulé », dans la même transaction que la
 * transition : une signature qui arriverait au même moment perd la course.
 */
export async function cancelBon(ctx: BonsWorkflowContext, id: string, actorId: string | null, rawReason?: string) {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'cancel');
  const reason = bon.status === 'draft' && !rawReason?.trim()
    ? DRAFT_ABANDONED
    : requireReason(rawReason, 'd’annulation');
  const now = new Date();

  await ctx.prisma.$transaction(async (tx) => {
    const transition = await tx.bon.updateMany({
      where: { id, status: { in: [...CANCELLABLE_BON_STATUSES] } },
      data: { status: 'cancelled', cancelledAt: now, cancellationReason: reason, awaitingSince: null },
    });
    if (transition.count === 0) throw statusChangedMeanwhile();
    await tx.signature.updateMany({
      where: { bonId: id, signed: false, type: { not: 'it_cachet' }, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: 'cancelled' },
    });
  });
  await writeAuditEntry(ctx.prisma, 'bon_cancelled', { actorId, bonId: id, details: { previousStatus: bon.status, reason } });
  await ctx.events.publish(DOMAIN_EVENTS.bonCancelled, {
    bonId: id, bonReference: bon.reference, actorId, occurredAt: now, previousStatus: bon.status, reason,
  });
}
