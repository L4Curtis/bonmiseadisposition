import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IN_PROGRESS_BON_STATUSES } from '../bons/bon-status';

/** Limite de lignes renvoyées par getEquipmentHistory — au-delà, `truncated:
 *  true` signale explicitement que le résultat est partiel plutôt que de
 *  tronquer silencieusement. */
const EQUIPMENT_HISTORY_LIMIT = 200;

/** Plafond du nombre de numéros de série vérifiés en une seule fois par
 *  findSerialConflicts — garde-fou contre une requête IN() démesurée. */
const SERIAL_CONFLICTS_LIMIT = 50;

/**
 * Historique d'un matériel : tous les bons où il apparaît, identifié par son
 * numéro de série OU son numéro d'inventaire (l'un ou l'autre suffit — les
 * deux comptent autant l'un que l'autre pour retrouver un équipement), du
 * plus récent au plus ancien (limité à EQUIPMENT_HISTORY_LIMIT ; `truncated`
 * indique explicitement si des résultats plus anciens ont été omis).
 * Répond à « où est le portable SN-1234 ? » comme à « où est le matériel
 * INV-5678 ? ». Alimente la page `/materiel/:reference`.
 */
export async function getEquipmentHistory(prisma: PrismaService, reference: string) {
  const query = (reference ?? '').trim();
  if (!query) return { items: [], truncated: false, total: 0 };

  const where: Prisma.BonEquipmentWhereInput = {
    OR: [
      { serialNumber: { equals: query, mode: 'insensitive' } },
      { inventoryNumber: { equals: query, mode: 'insensitive' } },
    ],
  };
  const [total, entries] = await Promise.all([
    prisma.bonEquipment.count({ where }),
    prisma.bonEquipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EQUIPMENT_HISTORY_LIMIT,
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
    inventoryNumber: e.inventoryNumber,
    label: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : e.customLabel,
    returnedAt: e.returnedAt,
    notReturned: e.notReturned,
    bon: e.bon,
  }));

  return { items, truncated: total > EQUIPMENT_HISTORY_LIMIT, total };
}

/**
 * Conflits de numéros de série : pour chaque numéro fourni, les bons encore
 * en cours de traitement (IN_PROGRESS_BON_STATUSES) où il figure déjà sans
 * avoir été rendu. Seule implémentation : elle sert l'écran de saisie
 * (GET /equipment/serial-conflicts) et l'envoi d'un bon (réponse 409
 * `serial_conflicts`). Avertissement non bloquant : l'IT confirme en
 * connaissance de cause.
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
        status: { in: [...IN_PROGRESS_BON_STATUSES] },
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
