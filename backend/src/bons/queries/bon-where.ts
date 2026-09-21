import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BonStatus, BON_SELECT_SHAPE } from '../../common/types';
import { buildOverdueSignatureWhere, DEFAULT_SIGNATURE_OVERDUE_DAYS } from '../../common/bon-predicates';

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
  const { status, excludeStatus, filialeId, search, overdue } = filters;
  const where: Prisma.BonWhereInput = {};

  // status and excludeStatus combine (AND) instead of one silently overriding the other
  if (status?.length || excludeStatus?.length) {
    where.status = {
      ...(status?.length ? { in: status } : {}),
      ...(excludeStatus?.length ? { notIn: excludeStatus } : {}),
    };
  }
  if (filialeId) where.filialeId = filialeId;
  if (search) {
    where.OR = buildSearchClauses(search);
  }
  if (overdue) {
    where.AND = [buildOverdueSignatureWhere(overdueDays)];
  }
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
