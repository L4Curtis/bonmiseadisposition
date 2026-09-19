import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Limite de lignes renvoyées par getSerialHistory — au-delà, `truncated:
 *  true` signale explicitement que le résultat est partiel plutôt que de
 *  tronquer silencieusement. */
const SERIAL_HISTORY_LIMIT = 200;

/** Plafond du nombre de numéros de série vérifiés en une seule fois par
 *  findSerialConflicts — garde-fou contre une requête IN() démesurée. */
const SERIAL_CONFLICTS_LIMIT = 50;

/** Statuts pour lesquels un équipement non rendu est considéré « en circulation ». */
const ACTIVE_BON_STATUSES = [
  'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
] as const;

/**
 * Historique d'un numéro de série : tous les bons où il apparaît, du plus
 * récent au plus ancien (limité à SERIAL_HISTORY_LIMIT ; `truncated`
 * indique explicitement si des résultats plus anciens ont été omis).
 * Répond à « où est le portable SN-1234 ? ».
 */
export async function getSerialHistory(prisma: PrismaService, serialNumber: string) {
  const query = (serialNumber ?? '').trim();
  if (!query) return { items: [], truncated: false, total: 0 };

  const where: Prisma.BonEquipmentWhereInput = { serialNumber: { equals: query, mode: 'insensitive' } };
  const [total, entries] = await Promise.all([
    prisma.bonEquipment.count({ where }),
    prisma.bonEquipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: SERIAL_HISTORY_LIMIT,
      include: {
        catalogItem: { select: { brand: true, model: true, category: true } },
        bon: {
          select: {
            id: true,
            reference: true,
            status: true,
            dateMiseDisposition: true,
            dateRestitution: true,
            collaborateur: { select: { displayName: true, email: true } },
            filiale: { select: { displayName: true } },
          },
        },
      },
    }),
  ]);

  const items = entries.map((e) => ({
    equipmentId: e.id,
    serialNumber: e.serialNumber,
    label: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : e.customLabel,
    returnedAt: e.returnedAt,
    notReturned: e.notReturned,
    bon: e.bon,
  }));

  return { items, truncated: total > SERIAL_HISTORY_LIMIT, total };
}

/**
 * Conflits de numéros de série : pour chaque numéro fourni, les bons « en
 * circulation » où il figure déjà sans avoir été rendu. Avertissement non
 * bloquant à la création/édition d'un bon (l'IT confirme en connaissance).
 * Au plus SERIAL_CONFLICTS_LIMIT numéros distincts sont vérifiés par appel ;
 * `truncated` signale explicitement si la liste fournie dépassait ce plafond.
 */
export async function findSerialConflicts(
  prisma: PrismaService,
  serials: string[],
  excludeBonId?: string,
) {
  const distinct = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
  const truncated = distinct.length > SERIAL_CONFLICTS_LIMIT;
  const cleaned = distinct.slice(0, SERIAL_CONFLICTS_LIMIT);
  if (cleaned.length === 0) return { items: [], truncated: false };

  const conflicts = await prisma.bonEquipment.findMany({
    where: {
      serialNumber: { in: cleaned, mode: 'insensitive' },
      returnedAt: null,
      notReturned: false,
      bon: {
        status: { in: [...ACTIVE_BON_STATUSES] },
        ...(excludeBonId ? { id: { not: excludeBonId } } : {}),
      },
    },
    include: {
      bon: {
        select: {
          id: true,
          reference: true,
          status: true,
          collaborateur: { select: { displayName: true } },
        },
      },
    },
  });

  const items = conflicts.map((c) => ({
    serialNumber: c.serialNumber,
    bonId: c.bon.id,
    bonReference: c.bon.reference,
    bonStatus: c.bon.status,
    collaborateur: c.bon.collaborateur?.displayName ?? '—',
  }));

  return { items, truncated };
}
