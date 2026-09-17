import { PrismaService } from '../../prisma/prisma.service';
import {
  CLOSED_BON_STATUSES,
  WAITING_SIGNATURE_STATUSES,
  PARTIAL_PENDING_SIGNATURE_TYPES,
  INVALIDATED_TOKEN_SENTINEL,
} from '../../common/bon-predicates';
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
  // UTC (pas l'heure locale du serveur) : un serveur dans un fuseau à l'ouest
  // de l'UTC décalerait sinon le début de mois d'une journée.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const closedStatuses = [...CLOSED_BON_STATUSES];

  const [waitingSignature, active, overdue, total, archivedThisMonth, partiallyReturned, filialesRaw] = await Promise.all([
    prisma.bon.count({
      where: {
        OR: [
          { status: { in: [...WAITING_SIGNATURE_STATUSES] } },
          {
            status: 'partially_returned',
            // tokenExpiresAt > sentinelle (epoch + 1s) exclut uniquement les
            // tokens invalidés VOLONTAIREMENT (resend, contestation, clôture) —
            // un token simplement expiré naturellement reste « en attente »,
            // aligné sur le cron de rappels (common/bon-predicates).
            signatures: {
              some: {
                signed: false,
                type: { in: [...PARTIAL_PENDING_SIGNATURE_TYPES] },
                tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
              },
            },
          },
        ],
      },
    }),
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
