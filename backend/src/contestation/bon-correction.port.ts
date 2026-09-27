import type { BonStatus, Prisma } from '@prisma/client';

/** Documents qu'une contestation Fondée fait corriger sur le bon lui-même. */
export type ReopenableDocument = 'restitution' | 'pv_cloture';

/**
 * Correction d'un bon après une contestation Fondée (décision du propriétaire).
 *
 * Le cycle de vie du bon appartient au module Bons : la contestation ne fait
 * qu'appeler ce port, DANS sa propre transaction, pour que la décision et la
 * correction soient enregistrées ensemble ou pas du tout.
 *  - Remise contestée : `createReplacementBon` crée un brouillon prérempli, lié
 *    à l'original (`Bon.replacesBonId`), que l'IT corrige puis envoie ;
 *    l'original est clôturé « remplacé » à la signature du remplaçant.
 *  - Restitution ou PV contesté : `reopenForCorrection` rouvre le bon
 *    d'origine ; aucun nouveau bon, l'IT corrige puis renvoie le document à
 *    signer.
 */
export interface BonCorrector {
  createReplacementBon(
    tx: Prisma.TransactionClient,
    originalBonId: string,
    contestationId: string,
    actorId: string,
  ): Promise<{ id: string; reference: string; status: BonStatus }>;

  reopenForCorrection(
    bonId: string,
    contestedDocument: ReopenableDocument,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}

/** Jeton d'injection du port. */
export const BON_CORRECTOR = Symbol('BON_CORRECTOR');
