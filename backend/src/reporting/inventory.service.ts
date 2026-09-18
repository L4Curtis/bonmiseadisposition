import { Injectable } from '@nestjs/common';
import { Prisma, EquipmentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATEGORY_LABELS,
  SITUATION_BON_STATUSES,
  buildParcEquipmentWhere,
  buildSituationBreakdown,
  parcEquipmentSql,
  situationCaseSql,
} from '../common/bon-predicates';
import { InventoryQueryDto, InventorySortField, SortDirection } from './dto/inventory-query.dto';
import { ITEM_SELECT, toInventoryItem } from './inventory-mapper';
import { buildInventoryCsv } from './inventory-csv';
import { parisMidnightUtc } from './inventory-dates';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
export const EXPORT_ROW_LIMIT = 10000;

/**
 * Vue « Inventaire du parc en circulation » : liste, résumé agrégé et export
 * CSV des équipements actuellement entre les mains des collaborateurs.
 *
 * Définition « en circulation » (élargie, cf. audit du 2026-09-18) :
 * BonEquipment dont le bon a un statut ∈ PARC_BON_STATUSES, returnedAt IS NULL
 * et notReturned = false — décomposée en 3 situations mutuellement
 * exclusives (`en_attente_signature`, `en_circulation`, `en_litige`), voir
 * bon-predicates.ts. Le mapping ligne → item (`toInventoryItem`) et le CSV
 * (`buildInventoryCsv`) sont extraits dans des modules dédiés pour rester
 * testables isolément et garder ce service sous la limite de lignes du repo.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Where partagé par la liste paginée et l'export CSV. Base « en
   *  circulation » (+ filiale) fournie par le prédicat commun
   *  `buildParcEquipmentWhere` — les autres filtres restent spécifiques à
   *  cette vue. `now` est injectable (tests) pour figer le filtre `overdue`. */
  private buildWhere(filters: InventoryQueryDto, now: Date = new Date()): Prisma.BonEquipmentWhereInput {
    const and: Prisma.BonEquipmentWhereInput[] = [
      ...(buildParcEquipmentWhere({ filialeId: filters.filialeId }).AND as Prisma.BonEquipmentWhereInput[]),
    ];

    if (filters.collaborateurId) {
      and.push({ bon: { collaborateurId: filters.collaborateurId } });
    }
    if (filters.situation) {
      and.push({ bon: { status: { in: [...SITUATION_BON_STATUSES[filters.situation]] } } });
    }
    if (filters.category) {
      // 'autre' couvre à la fois les équipements sans fiche catalogue
      // (customLabel) et ceux explicitement catégorisés 'autre'.
      and.push(
        filters.category === EquipmentCategory.autre
          ? { OR: [{ catalogItemId: null }, { catalogItem: { category: EquipmentCategory.autre } }] }
          : { catalogItem: { category: filters.category } },
      );
    }
    if (filters.overdue) {
      // Alimente la tuile « En retard de restitution » — indépendant de
      // `situation` (un équipement en_circulation ou en_litige peut être en
      // retard). `lt` exclut naturellement les dateRestitution NULL (SQL
      // `NULL < x` est indéterminé, jamais vrai).
      and.push({ bon: { dateRestitution: { lt: parisMidnightUtc(now) } } });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { serialNumber: { contains: search, mode: 'insensitive' } },
          { inventoryNumber: { contains: search, mode: 'insensitive' } },
          { customLabel: { contains: search, mode: 'insensitive' } },
          { catalogItem: { brand: { contains: search, mode: 'insensitive' } } },
          { catalogItem: { model: { contains: search, mode: 'insensitive' } } },
          { bon: { collaborateur: { displayName: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    return { AND: and };
  }

  /** `direction` s'applique au champ `sort` choisi ; à défaut, conserve les
   *  sens historiques (collaborateur/catégorie croissants, mise à disposition
   *  décroissante) pour ne pas changer l'ordre par défaut de la liste. */
  private buildOrderBy(sort?: InventorySortField, direction?: SortDirection): Prisma.BonEquipmentOrderByWithRelationInput {
    switch (sort) {
      case 'collaborateur':
        return { bon: { collaborateur: { displayName: direction ?? 'asc' } } };
      case 'category':
        return { catalogItem: { category: direction ?? 'asc' } };
      case 'dateMiseDisposition':
      default:
        return { bon: { dateMiseDisposition: direction ?? 'desc' } };
    }
  }

  /** GET /reporting/inventory */
  async getInventory(query: InventoryQueryDto, now: Date = new Date()) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const where = this.buildWhere(query, now);

    const [rows, total] = await Promise.all([
      this.prisma.bonEquipment.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: this.buildOrderBy(query.sort, query.direction),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bonEquipment.count({ where }),
    ]);

    return { items: rows.map((r) => toInventoryItem(r)), total, page, limit };
  }

  /**
   * GET /reporting/inventory/summary — agrégats calculés en SQL (GROUP BY /
   * COUNT côté base), jamais en itérant tout le parc en JS. Résumé toujours
   * global (non filtré) : `total` doit rester égal à `/kpi/parc.loaned.total`
   * sans filiale, les deux s'appuyant sur `parcEquipmentSql()`.
   *
   * `b.status::text` (dans `parcEquipmentSql`/`situationCaseSql`) : la colonne
   * est un enum Postgres ("BonStatus") et $queryRaw lie les valeurs de
   * Prisma.join comme des paramètres text. Sans le cast, Postgres refuse la
   * comparaison (« operator does not exist: "BonStatus" = text ») — invisible
   * dans les tests unitaires où $queryRaw est mocké, mais fatal en production
   * (résumé jamais chargé).
   *
   * `bySituation` : somme toujours égale à `total` (3 situations couvrant
   * exactement PARC_BON_STATUSES, zéro-complétées par `buildSituationBreakdown`).
   */
  async getSummary() {
    const [totalRows, byCategoryRows, byFilialeRows, bySituationRows, overdueRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE ${parcEquipmentSql()}
      `),
      this.prisma.$queryRaw<{ category: string; count: bigint }[]>(Prisma.sql`
        SELECT COALESCE(ec.category::text, 'autre') AS category, COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        LEFT JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
        WHERE ${parcEquipmentSql()}
        GROUP BY COALESCE(ec.category::text, 'autre')
        ORDER BY count DESC
      `),
      this.prisma.$queryRaw<{ filialeId: string; name: string; count: bigint }[]>(Prisma.sql`
        SELECT f.id AS "filialeId", f.display_name AS name, COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        JOIN filiales f ON f.id = b.filiale_id
        WHERE ${parcEquipmentSql()}
        GROUP BY f.id, f.display_name
        ORDER BY count DESC
      `),
      this.prisma.$queryRaw<{ situation: string; count: bigint }[]>(Prisma.sql`
        SELECT ${situationCaseSql()} AS situation, COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE ${parcEquipmentSql()}
        -- GROUP BY 1 (position) et non l'expression répétée : Prisma lie les valeurs
        -- de chaque expression CASE comme des paramètres distincts, que Postgres
        -- ne reconnaît alors pas comme identiques (« column b.status must appear in
        -- the GROUP BY clause »).
        GROUP BY 1
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE ${parcEquipmentSql()}
          AND b.date_restitution IS NOT NULL
          AND b.date_restitution < (now() AT TIME ZONE 'Europe/Paris')::date
      `),
    ]);

    return {
      total: Number(totalRows[0]?.count ?? 0),
      byCategory: byCategoryRows.map((r) => ({
        category: r.category,
        label: CATEGORY_LABELS[r.category] ?? r.category,
        count: Number(r.count),
      })),
      byFiliale: byFilialeRows.map((r) => ({
        filialeId: r.filialeId,
        name: r.name,
        count: Number(r.count),
      })),
      bySituation: buildSituationBreakdown(
        bySituationRows.map((r) => ({ situation: r.situation, count: Number(r.count) })),
      ),
      overdue: Number(overdueRows[0]?.count ?? 0),
    };
  }

  /**
   * GET /reporting/inventory/export — CSV complet (mêmes filtres et même tri
   * que la liste, sans pagination), plafonné à EXPORT_ROW_LIMIT lignes.
   * `now` est injectable (tests) pour figer le filtre `overdue` et les
   * colonnes calculées (ancienneté, retard) — voir inventory-csv.ts.
   */
  async getExportCsv(query: InventoryQueryDto, now: Date = new Date()): Promise<{ csv: string; truncated: boolean }> {
    const where = this.buildWhere(query, now);
    const rows = await this.prisma.bonEquipment.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: this.buildOrderBy(query.sort, query.direction),
      take: EXPORT_ROW_LIMIT + 1,
    });

    const truncated = rows.length > EXPORT_ROW_LIMIT;
    const items = (truncated ? rows.slice(0, EXPORT_ROW_LIMIT) : rows).map((r) => toInventoryItem(r));

    return { csv: buildInventoryCsv(items, now), truncated };
  }
}
