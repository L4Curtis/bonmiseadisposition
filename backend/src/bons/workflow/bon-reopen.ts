import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { computeBonFacts, lastSignedRestitutionAt } from './bon-facts';
import { invalidateItSignatures, invalidatePendingLinks } from './bon-links';
import { pendingDocument } from './state-machine';
import { writeAuditEntry } from '../../audit/audit-record';

/** Documents qu'une contestation Fondée fait corriger sur le bon lui-même. */
export type CorrectableDocument = 'restitution' | 'pv_cloture';

/**
 * Contestation « Fondée » sur une restitution ou un PV de non-restitution
 * (décision du propriétaire) : pas de nouveau bon, on corrige le bon
 * d'origine. Appelée par le module Contestation, une fois le bon revenu à son
 * statut d'avant la contestation, dans sa transaction.
 *
 * Effet : le document contesté ne peut plus être signé tel quel —
 *  - son lien en attente est invalidé (motif « contesté ») ;
 *  - pour une restitution, la signature IT de restitution ne vaut plus : une
 *    nouvelle sera exigée après la correction ;
 *  - l'horloge de la demande repart.
 * L'IT corrige ensuite avec les actions habituelles de la fiche : « Annuler
 * un marquage « rendu » » (équipement coché à tort), « Restitution … » (un
 * oubli), « Équipement retrouvé » (perte déclarée à tort), puis relance la
 * signature (signature IT, puis lien par email ou au guichet). La fiche le
 * propose d'elle-même : le document attend et aucun lien n'est valide.
 */
export async function reopenForCorrection(
  ctx: BonsWorkflowContext,
  bonId: string,
  document: CorrectableDocument,
  actorId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const run = async (db: Prisma.TransactionClient) => {
    const bon = await findBonDetailOrThrow(db, bonId);
    const pending = pendingDocument(computeBonFacts(bon));
    if (pending !== document) {
      throw new BadRequestException(
        document === 'restitution'
          ? 'Aucune restitution n’attend de signature sur ce bon : rien à corriger.'
          : 'Aucun PV de non-restitution n’attend de signature sur ce bon : rien à corriger.',
      );
    }
    await invalidatePendingLinks(db, bonId, 'contested', [document]);
    if (document === 'restitution') {
      await invalidateItSignatures(db, bonId, 'restitution', 'contested', lastSignedRestitutionAt(bon.signatures));
    }
    await db.bon.update({ where: { id: bonId }, data: { awaitingSince: new Date() }, select: { id: true } });
    await writeAuditEntry(db, 'bon_reopened_for_correction', { actorId, bonId, details: { document } });
  };
  if (tx) await run(tx);
  else await ctx.prisma.$transaction(run);
}
