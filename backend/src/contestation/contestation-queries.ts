import { BadRequestException } from '@nestjs/common';
import { ContestationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildContestationToProcessWhere } from '../common/bon-predicates';
import {
  CONTESTATION_OVERDUE_AFTER_DAYS,
  CONTESTATION_PEOPLE_INCLUDE,
  overdueThreshold,
} from './contestation-selects';

const KNOWN_STATUSES = new Set<string>(Object.values(ContestationStatus));

/** Filtre de statut de la liste : une valeur ou plusieurs séparées par des
 *  virgules (`open,in_review` = « À traiter ») ; `undefined` = toutes. Une
 *  valeur inconnue est refusée (400) plutôt qu'ignorée. */
export function parseContestationStatusFilter(raw: string | undefined): ContestationStatus[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  const unknown = values.find((v) => !KNOWN_STATUSES.has(v));
  if (unknown !== undefined) throw new BadRequestException(`Statut de contestation inconnu : ${unknown}`);
  return values.length > 0 ? (values as ContestationStatus[]) : undefined;
}

export interface ContestationListFilters {
  statuses?: ContestationStatus[];
  /** « À traiter » (`aTraiter=1`) : le prédicat partagé avec la tuile de
   *  l'accueil ; prime sur `statuses`. */
  toProcess?: boolean;
  page: number;
  limit: number;
}

/** Liste IT paginée, avec les compteurs globaux de l'en-tête et de la pastille. */
export async function findContestations(prisma: PrismaService, filters: ContestationListFilters, now = new Date()) {
  const { statuses, toProcess, page, limit } = filters;
  const pending = buildContestationToProcessWhere();
  const where: Prisma.ContestationWhereInput = toProcess ? pending : statuses ? { status: { in: statuses } } : {};
  const overdueSince = overdueThreshold(now);

  const [contestations, total, openCount, pendingCount, overdueCount] = await Promise.all([
    prisma.contestation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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

  return {
    contestations,
    total,
    page,
    limit,
    openCount,
    pendingCount,
    overdueCount,
    overdueAfterDays: CONTESTATION_OVERDUE_AFTER_DAYS,
    overdueSince,
  };
}

/** Contestations d'un collaborateur, telles qu'il peut les voir : ni le nom
 *  des techniciens, ni rien de ce qui est réservé à l'équipe informatique. */
export async function findMyContestations(prisma: PrismaService, userId: string) {
  const rows = await prisma.contestation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
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
  });
  return rows.map(({ bon, ...rest }) => ({
    ...rest,
    bon: { id: bon.id, reference: bon.reference },
    // Le remplaçant n'est annoncé que pour une contestation Fondée : un bon
    // peut avoir été contesté plusieurs fois.
    replacementBon: rest.outcome === 'founded' && bon.replacedBy ? bon.replacedBy : null,
  }));
}
