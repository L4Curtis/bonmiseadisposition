import { PrismaService } from '../../prisma/prisma.service';
import { buildAwaitingSignatureWhere } from '../../common/bon-predicates';
import { parisMonthStartUtc } from '../../common/dates/paris';
import { CLOSED_BON_STATUSES } from '../bon-status';
import { buildBonWhere } from './bon-where';

export interface BonStats {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
  partiallyReturned: number;
  overdueThresholdDays: number;
  byFiliale: Array<{ id: string; name: string; count: number }>;
}

/**
 * Statistiques du tableau de bord. Fonction pure côté logique : reçoit
 * `prisma` et le seuil de retard (`overdueThresholdDays`) explicitement au
 * lieu de les lire via `this` — la lecture de la config reste à la charge de
 * l'appelant (BonsService.getStats).
 */
export async function getBonStats(prisma: PrismaService, overdueThresholdDays: number): Promise<BonStats> {
  // « Ce mois-ci » = depuis le 1er du mois à Paris, comme les indicateurs :
  // le soir du dernier jour du mois en UTC, Paris est déjà le 1er.
  const monthStart = parisMonthStartUtc();
  const closedStatuses = [...CLOSED_BON_STATUSES];

  const [waitingSignature, active, overdue, total, archivedThisMonth, partiallyReturned, filialesRaw] = await Promise.all([
    // « Signatures attendues » : même prédicat que la tuile de l'accueil
    // (/kpi/aujourdhui) et que la liste GET /bons?awaitingSignature=1.
    prisma.bon.count({ where: buildAwaitingSignatureWhere() }),
    prisma.bon.count({ where: { status: 'active' } }),
    // Même définition que le filtre GET /bons?overdue=1 (buildBonWhere) : le
    // chiffre du tableau de bord doit correspondre à la liste obtenue après
    // clic — sinon partially_returned avec signature en attente était compté
    // dans la liste mais pas dans ce total.
    prisma.bon.count({ where: buildBonWhere({ overdue: true }, overdueThresholdDays) }),
    prisma.bon.count({
      where: { status: { notIn: closedStatuses } },
    }),
    // archivedAt (jamais updatedAt) : seul ce champ trace le moment réel de
    // l'archivage — updatedAt bouge pour d'autres raisons après coup.
    prisma.bon.count({
      where: { status: 'archived', archivedAt: { gte: monthStart } },
    }),
    prisma.bon.count({ where: { status: 'partially_returned' } }),
    prisma.filiale.findMany({
      where: { active: true },
      select: {
        id: true,
        displayName: true,
        _count: {
          select: {
            bons: { where: { status: { notIn: closedStatuses } } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    }),
  ]);

  return {
    waitingSignature,
    active,
    overdue,
    total,
    archivedThisMonth,
    partiallyReturned,
    overdueThresholdDays,
    byFiliale: filialesRaw
      .map((f) => ({ id: f.id, name: f.displayName, count: f._count.bons }))
      .filter((f) => f.count > 0),
  };
}
