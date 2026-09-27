import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BonStatus, BON_SELECT_SHAPE } from '../../common/types';
import {
  buildAwaitingSignatureWhere,
  buildExpiredLinkWhere,
  buildOverdueSignatureWhere,
  DEFAULT_SIGNATURE_OVERDUE_DAYS,
} from '../../common/bon-predicates';
import { BON_DETAIL_SELECT, BonDetailRow } from '../bon-view';
import type { BonSubStatus } from '../../contracts/bons';

// Canonical select shape: no Bytes columns, signatures restricted to API-safe
// fields (no token / signerIp / signerUserAgent / signatureImagePath).
export const BON_SELECT = BON_SELECT_SHAPE;

/** Filtres de liste partagés par findAll, getExportData et getStats. */
export interface BonListFilters {
  status?: BonStatus[];
  excludeStatus?: BonStatus[];
  filialeId?: string;
  search?: string;
  overdue?: boolean;
  /** « Signature attendue » (tuile de l'accueil). */
  awaitingSignature?: boolean;
  /** « Lien expiré » (tuile de l'accueil). */
  linkExpired?: boolean;
  /** Période sur la date de mise à disposition, bornes incluses (AAAA-MM-JJ). */
  dateFrom?: string;
  dateTo?: string;
  /** Uniquement les bons sans date de restitution prévue. */
  noReturnDate?: boolean;
  /** Créateur du bon (Bon.createdById, toujours renseigné). */
  createdById?: string;
  /** Sélection explicite (export de la sélection de la liste). */
  ids?: string[];
  /** Sous-état de « Restitution en cours » (même règle que la fiche) ;
   *  résolu en identifiants par le service (voir bon-substatus-filter.ts). */
  subStatus?: BonSubStatus;
  /** Identifiants retenus par le filtre de sous-état : une liste vide ne
   *  renvoie aucun bon (contrairement à `ids` vide, qui ne filtre rien). */
  restrictToIds?: readonly string[];
}

/** Une date AAAA-MM-JJ en minuit UTC : la colonne date_mise_disposition est un
 *  `DATE` Postgres, que Prisma compare à minuit UTC — une date construite à
 *  l'heure locale du serveur décalerait la borne d'un jour hors UTC. */
function utcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Recherche libre : référence, nom/email du collaborateur, ou n° de série /
 *  n° d'inventaire d'un équipement (les deux comptent autant l'un que
 *  l'autre — lot L1, cf. GlobalSearch côté front). */
export function buildSearchClauses(search: string): Prisma.BonWhereInput[] {
  return [
    { reference: { contains: search, mode: 'insensitive' } },
    { collaborateur: { displayName: { contains: search, mode: 'insensitive' } } },
    { collaborateur: { email: { contains: search, mode: 'insensitive' } } },
    { equipments: { some: { serialNumber: { contains: search, mode: 'insensitive' } } } },
    { equipments: { some: { inventoryNumber: { contains: search, mode: 'insensitive' } } } },
  ];
}

/** Construit le where Prisma partagé par findAll, getExportData et
 *  getStats. `overdueDays` — seuil (jours) de retard de signature,
 *  définition unique partagée avec `/bons/stats` et `/kpi/delais`
 *  (`common/bon-predicates.buildOverdueSignatureWhere`). */
export function buildBonWhere(
  filters: BonListFilters,
  overdueDays: number = DEFAULT_SIGNATURE_OVERDUE_DAYS,
): Prisma.BonWhereInput {
  const {
    status, excludeStatus, filialeId, search, overdue, awaitingSignature, linkExpired,
    dateFrom, dateTo, noReturnDate, createdById, ids, restrictToIds,
  } = filters;
  const where: Prisma.BonWhereInput = {};

  // status and excludeStatus combine (AND) instead of one silently overriding the other
  if (status?.length || excludeStatus?.length) {
    where.status = {
      ...(status?.length ? { in: status } : {}),
      ...(excludeStatus?.length ? { notIn: excludeStatus } : {}),
    };
  }
  if (filialeId) where.filialeId = filialeId;
  if (createdById) where.createdById = createdById;
  if (restrictToIds) where.id = { in: [...restrictToIds] };
  else if (ids?.length) where.id = { in: ids };
  if (dateFrom || dateTo) {
    where.dateMiseDisposition = {
      ...(dateFrom ? { gte: utcDay(dateFrom) } : {}),
      ...(dateTo ? { lte: utcDay(dateTo) } : {}),
    };
  }
  if (noReturnDate) where.dateRestitution = null;
  if (search) {
    where.OR = buildSearchClauses(search);
  }
  // Mêmes prédicats que les tuiles de l'accueil (common/bon-predicates) :
  // le chiffre de la tuile est celui de la liste.
  const predicates: Prisma.BonWhereInput[] = [
    ...(overdue ? [buildOverdueSignatureWhere(overdueDays)] : []),
    ...(awaitingSignature ? [buildAwaitingSignatureWhere()] : []),
    ...(linkExpired ? [buildExpiredLinkWhere()] : []),
  ];
  if (predicates.length > 0) where.AND = predicates;
  return where;
}

/** Charge un bon par id avec le select canonique (BON_SELECT) — 404 si absent. */
export async function findBonOrThrow(prisma: PrismaService, id: string) {
  const bon = await prisma.bon.findUnique({
    where: { id },
    ...BON_SELECT,
  });
  if (!bon) throw new NotFoundException('Bon introuvable');
  return bon;
}

/** Charge un bon avec le select de la fiche (`BON_DETAIL_SELECT` : colonnes de
 *  la vague 2, compte du collaborateur, signatures avec leur invalidation),
 *  ce que lisent la machine à états et les émetteurs de lien — 404 si absent. */
export async function findBonDetailOrThrow(prisma: Pick<Prisma.TransactionClient, 'bon'>, id: string): Promise<BonDetailRow> {
  const bon = await prisma.bon.findUnique({ where: { id }, ...BON_DETAIL_SELECT });
  if (!bon) throw new NotFoundException('Bon introuvable');
  return bon;
}
