import { Prisma } from '@prisma/client';

/**
 * Bons clos (clôturés ou annulés) AVANT `cutoff`, mesuré sur la date réelle de
 * clôture : `archivedAt` pour un bon clôturé, `cancelledAt` pour un bon
 * annulé. Jamais `updatedAt`, qu'une écriture technique (régénération d'un
 * PDF, correction d'une donnée) repousserait, et avec elle la purge.
 *
 * Un bon clos avant que ces dates n'existent (aucune des deux renseignée) se
 * rabat sur `updatedAt`, seul repère disponible pour lui.
 */
export function closedBeforeWhere(cutoff: Date): Prisma.BonWhereInput {
  return {
    OR: [
      { status: 'archived', archivedAt: { lt: cutoff } },
      { status: 'cancelled', cancelledAt: { lt: cutoff } },
      { status: 'archived', archivedAt: null, updatedAt: { lt: cutoff } },
      { status: 'cancelled', cancelledAt: null, updatedAt: { lt: cutoff } },
    ],
  };
}
