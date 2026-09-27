import { Prisma } from '@prisma/client';
import { BON_LIST_SELECT } from './queries/bon-list-select';
import { computeBonFacts, computePendingSignature } from './workflow/bon-facts';
import { subStatus } from './workflow/state-machine';
import { computeLateness } from './bon-view';

/**
 * Ligne de la liste des bons (`BonListItem`) : la projection allégée, plus le
 * sous-état, le document en attente (bouton « Renvoyer » de la ligne) et les
 * retards, calculés par la même machine à états que la fiche. La réponse ne
 * garde que les signatures non signées et les colonnes d'équipement que la
 * liste affiche.
 */
export type BonListRow = Prisma.BonGetPayload<{ select: typeof BON_LIST_SELECT }>;

export function presentBonListItem(bon: BonListRow, signatureOverdueDays: number, now: Date = new Date()) {
  const facts = computeBonFacts(bon, now.getTime());
  const { awaitingSince: _awaitingSince, collaborateur, equipments, signatures, ...columns } = bon;
  return {
    ...columns,
    collaborateur: { id: collaborateur.id, displayName: collaborateur.displayName, email: collaborateur.email },
    equipments: equipments.map(({ returnedAt: _r, notReturned: _n, ...equipment }) => equipment),
    signatures: signatures
      .filter((s) => !s.signed)
      .map((s) => ({ type: s.type, signed: false as const, createdAt: s.createdAt })),
    subStatus: subStatus(facts),
    pendingSignature: computePendingSignature(bon, facts, now.getTime()),
    lateness: computeLateness(bon, facts, signatureOverdueDays, now),
    canSendLink: facts.canSendLink,
  };
}
