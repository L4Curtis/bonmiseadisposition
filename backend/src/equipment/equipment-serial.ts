import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IN_PROGRESS_BON_STATUSES } from '../bons/bon-status';
import { toListResponse, toPrismaPage, type PageRequest } from '../common/pagination';
import type { ListResponse } from '../contracts/common';
import type { EquipmentHistoryMeta } from '../contracts/equipment';
import { equipmentHolding } from './equipment-holding';

/** Plafond de l'export CSV de l'historique d'un matériel : au-delà, le
 *  fichier est coupé et l'en-tête `X-Truncated` le signale. */
export const EQUIPMENT_HISTORY_EXPORT_LIMIT = 5000;

/** Plafond du nombre de numéros de série vérifiés en une seule fois par
 *  findSerialConflicts — garde-fou contre une requête IN() démesurée. */
const SERIAL_CONFLICTS_LIMIT = 50;

const HISTORY_INCLUDE = {
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
} satisfies Prisma.BonEquipmentInclude;

type HistoryRow = Prisma.BonEquipmentGetPayload<{ include: typeof HISTORY_INCLUDE }>;

function toHistoryEntry(e: HistoryRow) {
  return {
    equipmentId: e.id,
    serialNumber: e.serialNumber,
    inventoryNumber: e.inventoryNumber,
    label: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : e.customLabel,
    returnedAt: e.returnedAt,
    notReturned: e.notReturned,
    holding: equipmentHolding({ returnedAt: e.returnedAt, notReturned: e.notReturned, bonStatus: e.bon.status }),
    bon: e.bon,
  };
}

export type EquipmentHistoryItem = ReturnType<typeof toHistoryEntry>;

/**
 * Historique d'un matériel : tous les bons où il apparaît, identifié par son
 * numéro de série OU son numéro d'inventaire (l'un ou l'autre suffit), du
 * plus récent au plus ancien, page par page. Répond à « où est le portable
 * SN-1234 ? » comme à « où est le matériel INV-5678 ? ». Alimente la page
 * `/materiel/:reference`. Chaque ligne porte sa situation (`holding`, voir
 * equipment-holding.ts) : un brouillon n'a pas de détenteur.
 */
export async function getEquipmentHistory(
  prisma: PrismaService,
  reference: string,
  page: PageRequest,
): Promise<ListResponse<EquipmentHistoryItem, EquipmentHistoryMeta>> {
  const meta: EquipmentHistoryMeta = { exportLimit: EQUIPMENT_HISTORY_EXPORT_LIMIT };
  const query = (reference ?? '').trim();
  if (!query) return toListResponse([], { total: 0, page: page.page, limit: page.limit, meta });

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
      // L'identifiant départage deux lignes créées au même instant : une
      // ligne ne saute pas d'une page à l'autre.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...toPrismaPage(page),
      include: HISTORY_INCLUDE,
    }),
  ]);
  return toListResponse(entries.map(toHistoryEntry), { total, page: page.page, limit: page.limit, meta });
}

/** Lignes de l'export CSV : tout l'historique, jusqu'au plafond
 *  EQUIPMENT_HISTORY_EXPORT_LIMIT (`truncated` s'il est dépassé). */
export async function getEquipmentHistoryForExport(
  prisma: PrismaService,
  reference: string,
): Promise<{ items: EquipmentHistoryItem[]; truncated: boolean }> {
  const all = await getEquipmentHistory(prisma, reference, { page: 1, limit: EQUIPMENT_HISTORY_EXPORT_LIMIT });
  return { items: all.items, truncated: all.total > EQUIPMENT_HISTORY_EXPORT_LIMIT };
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
 *
 * `excludeBonId` : le bon en cours de saisie. Le bon qu'il remplace
 * (contestation Fondée sur une remise) est exclu avec lui : il porte forcément
 * les mêmes numéros, et sera clôturé « remplacé » à la signature du
 * remplaçant — ce n'est pas un conflit.
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

  const excluded = await excludedBonIds(prisma, excludeBonId);
  const conflicts = await prisma.bonEquipment.findMany({
    where: {
      serialNumber: { in: cleaned, mode: 'insensitive' },
      returnedAt: null,
      notReturned: false,
      bon: {
        status: { in: [...IN_PROGRESS_BON_STATUSES] },
        ...(excluded.length > 0 ? { id: { notIn: excluded } } : {}),
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

/** Bon en cours de saisie et bon qu'il remplace, s'il y en a un. */
async function excludedBonIds(prisma: PrismaService, excludeBonId: string | undefined): Promise<string[]> {
  if (!excludeBonId) return [];
  const bon = await prisma.bon.findUnique({ where: { id: excludeBonId }, select: { replacesBonId: true } });
  return bon?.replacesBonId ? [excludeBonId, bon.replacesBonId] : [excludeBonId];
}
