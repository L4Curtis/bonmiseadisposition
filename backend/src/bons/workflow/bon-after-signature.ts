import type { SignatureSignedEvent } from '../../common/events';
import { BON_DETAIL_SELECT } from '../bon-view';
import { BonsWorkflowContext } from './bon-context';
import { computeBonFacts } from './bon-facts';
import { emitPvClotureIfDue } from './bon-cloture';
import { closeReplacedOriginal } from './bon-replacement';
import { pendingDocument } from './state-machine';

/**
 * Suites d'une signature du collaborateur (événement `signature.signed`,
 * publié par la signature une fois le nouveau statut écrit) :
 *  1. une restitution signée alors qu'un équipement manque : le PV de
 *     non-restitution part (la machine à états dit s'il est dû) ;
 *  2. l'horloge de la demande s'arrête si plus rien n'attend la signature ;
 *  3. la remise d'un bon remplaçant signée : l'original est clôturé comme
 *     remplacé.
 * Chaque étape est idempotente : un événement rejoué ne refait rien.
 */
export async function afterCollaboratorSignature(ctx: BonsWorkflowContext, event: SignatureSignedEvent): Promise<void> {
  if (event.documentType === 'restitution' && event.newStatus === 'partially_returned') {
    const emitted = await emitPvClotureIfDue(ctx, event.bonId, undefined, null);
    if (emitted) ctx.logger.log(`Bon ${event.bonReference} — PV de non-restitution émis après la restitution signée`);
  }
  await stopClockIfNothingAwaits(ctx, event.bonId);
  if (event.documentType === 'mise_disposition' && event.newStatus === 'active') {
    await closeReplacedOriginal(ctx, event.bonId);
  }
}

async function stopClockIfNothingAwaits(ctx: BonsWorkflowContext, bonId: string): Promise<void> {
  const bon = await ctx.prisma.bon.findUnique({ where: { id: bonId }, ...BON_DETAIL_SELECT });
  if (!bon || bon.awaitingSince === null) return;
  if (pendingDocument(computeBonFacts(bon)) === null) {
    await ctx.prisma.bon.update({ where: { id: bonId }, data: { awaitingSince: null }, select: { id: true } });
  }
}
