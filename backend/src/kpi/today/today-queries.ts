import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildContestationToProcessWhere,
  buildExpiredLinkWhere,
  buildOverdueSignatureWhere,
  buildParcEquipmentWhere,
  buildReturnOverdueEquipmentWhere,
} from '../../common/bon-predicates';
import { findBonIdsBySubStatus } from '../../bons/queries/bon-substatus-filter';
import { computeBonFacts } from '../../bons/workflow/bon-facts';
import { CONTESTATION_STATUS_LABELS_SHORT, TodayRow, TodaySection } from './today-types';

/**
 * Sections « À traiter » de l'accueil IT : pour chaque notion, le total (même
 * prédicat que la tuile et que la liste « Voir tout ») et les lignes les plus
 * anciennes, avec la date depuis laquelle la situation dure.
 */

/** Lignes affichées par section ; le reste est dans la liste « Voir tout ». */
export const TODAY_ROWS_PER_SECTION = 5;

const BON_ROW_SELECT = {
  id: true,
  reference: true,
  collaborateur: { select: { id: true, displayName: true } },
} satisfies Prisma.BonSelect;

type BonRowBase = Prisma.BonGetPayload<{ select: typeof BON_ROW_SELECT }>;

function bonRow(bon: BonRowBase, since: Date, detail: string | null = null): TodayRow {
  return {
    bonId: bon.id,
    reference: bon.reference,
    collaborateurId: bon.collaborateur.id,
    collaborateur: bon.collaborateur.displayName,
    since: since.toISOString(),
    detail,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

/** Brouillons jamais envoyés, du plus ancien au plus récent. */
export async function draftsSection(prisma: PrismaService): Promise<TodaySection> {
  const where: Prisma.BonWhereInput = { status: 'draft' };
  const [total, bons] = await Promise.all([
    prisma.bon.count({ where }),
    prisma.bon.findMany({
      where,
      select: { ...BON_ROW_SELECT, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { reference: 'asc' }],
      take: TODAY_ROWS_PER_SECTION,
    }),
  ]);
  return { total, rows: bons.map((b) => bonRow(b, b.createdAt)) };
}

/** « Signature en retard » : depuis la demande de signature (`awaitingSince`). */
export async function overdueSignaturesSection(
  prisma: PrismaService,
  thresholdDays: number,
  now: Date,
): Promise<TodaySection> {
  const where = buildOverdueSignatureWhere(thresholdDays, now);
  const [total, bons] = await Promise.all([
    prisma.bon.count({ where }),
    prisma.bon.findMany({
      where,
      select: { ...BON_ROW_SELECT, awaitingSince: true, status: true },
      orderBy: [{ awaitingSince: 'asc' }, { reference: 'asc' }],
      take: TODAY_ROWS_PER_SECTION,
    }),
  ]);
  return { total, rows: bons.map((b) => bonRow(b, b.awaitingSince ?? now)) };
}

/** « Lien expiré » : depuis l'expiration du dernier lien envoyé. */
export async function expiredLinksSection(prisma: PrismaService, now: Date): Promise<TodaySection> {
  const where = buildExpiredLinkWhere(now);
  const [total, bons] = await Promise.all([
    prisma.bon.count({ where }),
    prisma.bon.findMany({
      where,
      select: {
        ...BON_ROW_SELECT,
        signatures: {
          where: { signed: false, invalidatedAt: null, tokenExpiresAt: { lte: now } },
          select: { tokenExpiresAt: true },
          orderBy: { tokenExpiresAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ awaitingSince: 'asc' }, { reference: 'asc' }],
      take: TODAY_ROWS_PER_SECTION,
    }),
  ]);
  return { total, rows: bons.map((b) => bonRow(b, b.signatures[0]?.tokenExpiresAt ?? now)) };
}

/** « Retour en retard » : un bon par ligne, depuis la date de restitution
 *  prévue ; le total compte des ÉQUIPEMENTS (comme la tuile et l'inventaire). */
export async function overdueReturnsSection(prisma: PrismaService, now: Date): Promise<TodaySection & { bons: number }> {
  const equipmentWhere = buildReturnOverdueEquipmentWhere({}, now);
  const [total, grouped] = await Promise.all([
    prisma.bonEquipment.count({ where: equipmentWhere }),
    prisma.bonEquipment.groupBy({ by: ['bonId'], where: equipmentWhere, _count: { _all: true } }),
  ]);
  const countByBon = new Map(grouped.map((g) => [g.bonId, g._count._all]));
  const bons = await prisma.bon.findMany({
    where: { id: { in: [...countByBon.keys()] } },
    select: { ...BON_ROW_SELECT, dateRestitution: true },
    orderBy: [{ dateRestitution: 'asc' }, { reference: 'asc' }],
    take: TODAY_ROWS_PER_SECTION,
  });
  const rows = bons.map((b) =>
    bonRow(b, b.dateRestitution ?? now, plural(countByBon.get(b.id) ?? 0, 'équipement', 'équipements')),
  );
  return { total, bons: countByBon.size, rows };
}

/** Ce qu'il faut lire d'un bon pour compter ses équipements rendus qui
 *  attendent la signature de leur restitution (règle de la fiche). */
const RETURN_FACTS_SELECT = {
  status: true,
  awaitingSince: true,
  collaborateur: { select: { id: true, displayName: true, active: true, email: true } },
  equipments: { select: { returnedAt: true, notReturned: true } },
  signatures: {
    select: {
      type: true, signed: true, signedAt: true, tokenExpiresAt: true, createdAt: true,
      isInPerson: true, pdfType: true, invalidatedAt: true,
    },
  },
} satisfies Prisma.BonSelect;

/**
 * « Restitution partielle à signer » : bons « Restitution en cours » dont des
 * équipements rendus attendent la signature de leur restitution. Les bons
 * sont choisis par la règle du filtre `GET /bons?subStatus=partial_restitution_to_sign`
 * (bons/queries/bon-substatus-filter.ts), réutilisée telle quelle : le chiffre
 * est le nombre de lignes de la liste. Depuis la demande de signature.
 */
export async function partialRestitutionsSection(prisma: PrismaService, now: Date): Promise<TodaySection> {
  const ids = await findBonIdsBySubStatus(prisma, 'partial_restitution_to_sign');
  if (ids.length === 0) return { total: 0, rows: [] };
  const bons = await prisma.bon.findMany({
    where: { id: { in: ids } },
    select: { id: true, reference: true, ...RETURN_FACTS_SELECT },
    orderBy: [{ awaitingSince: 'asc' }, { reference: 'asc' }],
    take: TODAY_ROWS_PER_SECTION,
  });
  const rows = bons.map((b) => {
    const toSign = computeBonFacts(b, now.getTime()).returnedToSign;
    return bonRow(b, b.awaitingSince ?? now, plural(toSign, 'équipement à signer', 'équipements à signer'));
  });
  return { total: ids.length, rows };
}

/** « Contestations à traiter » : depuis la réception, avec l'étape. */
export async function contestationsSection(prisma: PrismaService): Promise<TodaySection> {
  const where = buildContestationToProcessWhere();
  const [total, contestations] = await Promise.all([
    prisma.contestation.count({ where }),
    prisma.contestation.findMany({
      where,
      select: { createdAt: true, status: true, bon: { select: BON_ROW_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: TODAY_ROWS_PER_SECTION,
    }),
  ]);
  return {
    total,
    rows: contestations.map((c) => bonRow(c.bon, c.createdAt, CONTESTATION_STATUS_LABELS_SHORT[c.status] ?? null)),
  };
}

/** « Départs avec matériel » : collaborateurs au compte désactivé qui
 *  détiennent encore des équipements (un par ligne, prêt le plus ancien). */
export async function departuresSection(prisma: PrismaService): Promise<TodaySection & { equipments: number }> {
  const where: Prisma.BonEquipmentWhereInput = {
    AND: [buildParcEquipmentWhere(), { bon: { collaborateur: { active: false } } }],
  };
  const items = await prisma.bonEquipment.findMany({
    where,
    select: { bon: { select: { ...BON_ROW_SELECT, dateMiseDisposition: true } } },
  });
  const byPerson = new Map<string, { bon: BonRowBase; since: Date; count: number }>();
  for (const { bon } of items) {
    const known = byPerson.get(bon.collaborateur.id);
    const since = known && known.since <= bon.dateMiseDisposition ? known.since : bon.dateMiseDisposition;
    const keep = known && known.since <= bon.dateMiseDisposition ? known.bon : bon;
    byPerson.set(bon.collaborateur.id, { bon: keep, since, count: (known?.count ?? 0) + 1 });
  }
  const rows = [...byPerson.values()]
    .sort((a, b) => a.since.getTime() - b.since.getTime() || a.bon.reference.localeCompare(b.bon.reference))
    .slice(0, TODAY_ROWS_PER_SECTION)
    .map((p) => bonRow(p.bon, p.since, plural(p.count, 'équipement', 'équipements')));
  return { total: byPerson.size, equipments: items.length, rows };
}
