import type { BonSubStatus } from '../../contracts/bons';
import { PrismaService } from '../../prisma/prisma.service';
import { computeBonFacts } from '../workflow/bon-facts';
import { subStatus as computeSubStatus } from '../workflow/state-machine';

/** Ce qu'il faut lire d'un bon pour calculer son sous-état (même lecture que la fiche). */
const SUB_STATUS_SELECT = {
  id: true,
  status: true,
  collaborateur: { select: { active: true, email: true } },
  equipments: { select: { returnedAt: true, notReturned: true } },
  signatures: {
    select: {
      type: true, signed: true, signedAt: true, tokenExpiresAt: true, createdAt: true,
      isInPerson: true, pdfType: true, invalidatedAt: true,
    },
  },
} as const;

/**
 * Identifiants des bons « Restitution en cours » dont le sous-état vaut
 * `wanted`. Le sous-état dépend des dates (équipement marqué rendu après la
 * dernière restitution signée) : plutôt que de le réécrire en SQL, on applique
 * EXACTEMENT la règle de la fiche (`computeBonFacts` + `subStatus`) aux seuls
 * bons « Restitution en cours », peu nombreux. Le nombre de lignes de la liste
 * filtrée est ainsi celui qu'annonce l'accueil.
 */
export async function findBonIdsBySubStatus(prisma: PrismaService, wanted: BonSubStatus): Promise<string[]> {
  const bons = await prisma.bon.findMany({ where: { status: 'partially_returned' }, select: SUB_STATUS_SELECT });
  const now = Date.now();
  return bons.filter((bon) => computeSubStatus(computeBonFacts(bon, now)) === wanted).map((bon) => bon.id);
}

/** Restreint une sélection d'identifiants (filtre `ids` éventuel) à ceux du sous-état. */
export function intersectIds(selected: readonly string[] | undefined, bySubStatus: readonly string[]): string[] {
  if (!selected?.length) return [...bySubStatus];
  const allowed = new Set(bySubStatus);
  return selected.filter((id) => allowed.has(id));
}
