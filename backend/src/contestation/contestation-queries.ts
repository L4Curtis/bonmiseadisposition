import { ContestationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildContestationToProcessWhere } from '../common/bon-predicates';
import { toFullListResponse, toListResponse, toPrismaPage } from '../common/pagination';
import {
  CONTESTATION_OVERDUE_AFTER_DAYS,
  CONTESTATION_PEOPLE_INCLUDE,
  overdueThreshold,
} from './contestation-selects';

/** Contestations d'un collaborateur : au-delà, la liste est coupée (`truncated`). */
export const MY_CONTESTATIONS_MAX = 100;

export interface ContestationListFilters {
  statuses?: ContestationStatus[];
  /** « À traiter » (`aTraiter=1`) : le prédicat partagé avec la tuile de
   *  l'accueil ; prime sur `statuses`. */
  toProcess?: boolean;
  page: number;
  limit: number;
}

/** Liste IT paginée, à la forme commune ; les compteurs globaux de l'en-tête
 *  et de la pastille sont dans `meta`. */
export async function findContestations(prisma: PrismaService, filters: ContestationListFilters, now = new Date()) {
  const { statuses, toProcess, page, limit } = filters;
  const pending = buildContestationToProcessWhere();
  const where: Prisma.ContestationWhereInput = toProcess ? pending : statuses ? { status: { in: statuses } } : {};
  const overdueSince = overdueThreshold(now);

  const [contestations, total, openCount, pendingCount, overdueCount] = await Promise.all([
    prisma.contestation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toPrismaPage({ page, limit }),
      include: {
        ...CONTESTATION_PEOPLE_INCLUDE,
        bon: { select: { id: true, reference: true, status: true, filiale: { select: { displayName: true } } } },
      },
    }),
    prisma.contestation.count({ where }),
    prisma.contestation.count({ where: { status: 'open' } }),
    prisma.contestation.count({ where: pending }),
    prisma.contestation.count({ where: { ...pending, createdAt: { lt: overdueSince } } }),
  ]);

  return toListResponse(contestations, {
    total,
    page,
    limit,
    meta: { openCount, pendingCount, overdueCount, overdueAfterDays: CONTESTATION_OVERDUE_AFTER_DAYS, overdueSince },
  });
}

/** Contestations d'un collaborateur, telles qu'il peut les voir : ni le nom
 *  des techniciens, ni rien de ce qui est réservé à l'équipe informatique. */
export async function findMyContestations(prisma: PrismaService, userId: string) {
  const [rows, total] = await Promise.all([prisma.contestation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MY_CONTESTATIONS_MAX,
    select: {
      id: true,
      contestedDocument: true,
      message: true,
      status: true,
      outcome: true,
      createdAt: true,
      reviewedAt: true,
      resolvedAt: true,
      resolutionMessage: true,
      bon: { select: { id: true, reference: true, replacedBy: { select: { id: true, reference: true } } } },
    },
  }), prisma.contestation.count({ where: { userId } })]);
  const items = rows.map(({ bon, ...rest }) => ({
    ...rest,
    bon: { id: bon.id, reference: bon.reference },
    // Le remplaçant n'est annoncé que pour une contestation Fondée : un bon
    // peut avoir été contesté plusieurs fois.
    replacementBon: rest.outcome === 'founded' && bon.replacedBy ? bon.replacedBy : null,
  }));
  return total > rows.length
    ? toListResponse(items, { total, page: 1, limit: MY_CONTESTATIONS_MAX, truncated: true })
    : toFullListResponse(items);
}
