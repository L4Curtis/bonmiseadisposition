import { Injectable } from '@nestjs/common';
import { Prisma, EquipmentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BLANK_SERIAL_VALUES_SQL,
  NOT_RETURNED_SITUATION,
  OFF_CATALOG_WHERE,
  SITUATION_BON_STATUSES,
  buildMissingSerialWhere,
  buildNotReturnedEquipmentWhere,
  buildParcEquipmentWhere,
  buildReturnOverdueEquipmentWhere,
  buildSituationBreakdown,
  notReturnedEquipmentSql,
  parcEquipmentSql,
  returnOverdueEquipmentSql,
  situationCaseSql,
} from '../common/bon-predicates';
import { categoryLabel } from '../common/category-labels';
import { InventoryQueryDto, InventoryWhereFilters } from './dto/inventory-query.dto';
import { InventoryByCollaborateurQueryDto } from './dto/inventory-by-collaborateur-query.dto';
import { toInventoryItem } from './inventory-mapper';
import { buildInventoryCsv } from './inventory-csv';
import { findSortedInventoryRows } from './inventory-sort';
import { DEFAULT_EXPORT_ROW_LIMIT, inventoryExportRowLimit } from './inventory-export-limit';
import { DEFAULT_PAGE_SIZE, toListResponse, toPrismaPage } from '../common/pagination';
import type { InventoryListMeta } from '../contracts/inventory';
import {
  COLLABORATEUR_GROUP_SELECT,
  groupInventoryByCollaborateur,
  sortCollaborateurGroups,
} from './inventory-collaborateur-aggregate';

/** Plafond par défaut de l'export CSV (abaissable en recette, voir
 *  inventory-export-limit.ts). */
export const EXPORT_ROW_LIMIT = DEFAULT_EXPORT_ROW_LIMIT;
/** Plafond de lignes chargées pour le regroupement par collaborateur — même
 *  ordre de grandeur que EXPORT_ROW_LIMIT (le parc en circulation réel compte
 *  quelques milliers d'équipements), voir inventory-collaborateur-aggregate.ts. */
export const AGGREGATION_ROW_LIMIT = 10000;

/** Tri effectif : sur la seule situation « Non restitué », trier par
 *  situation n'a pas de sens, et le découpage par statut de bon de
 *  `findSortedInventoryRows` écarterait les bons clôturés. Ordre par défaut. */
function sortOf(query: InventoryListQuery): InventoryQueryDto['sort'] {
  return query.situation === NOT_RETURNED_SITUATION && query.sort === 'situation' ? undefined : query.sort;
}

/** Requête de liste telle que la reçoit le service : le DTO validé, dont
 *  chaque champ reste facultatif pour un appel interne (page 1 de 25 lignes
 *  par défaut). */
type InventoryListQuery = Partial<InventoryQueryDto>;
type InventoryByCollaborateurQuery = Partial<InventoryByCollaborateurQueryDto>;

/** Page demandée, avec les valeurs par défaut du DTO commun. */
function pageOf(query: { page?: number; limit?: number }): { page: number; limit: number } {
  return { page: query.page ?? 1, limit: query.limit ?? DEFAULT_PAGE_SIZE };
}

/**
 * Vue « Inventaire du parc en circulation » : liste, résumé agrégé et export
 * CSV des équipements actuellement entre les mains des collaborateurs.
 *
 * Définition « en circulation » (élargie, cf. audit du 2026-09-18) :
 * BonEquipment dont le bon a un statut ∈ PARC_BON_STATUSES, returnedAt IS NULL
 * et notReturned = false — décomposée en 3 situations mutuellement
 * exclusives (`en_attente_signature`, `en_circulation`, `en_litige`), voir
 * bon-predicates.ts. La situation `non_restitue` remplace ce parc par les
 * équipements encore non restitués (`buildNotReturnedEquipmentWhere`). Le mapping ligne → item (`toInventoryItem`) et le CSV
 * (`buildInventoryCsv`) sont extraits dans des modules dédiés pour rester
 * testables isolément et garder ce service sous la limite de lignes du repo.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Where partagé par la liste paginée, l'export CSV et le regroupement par
   *  collaborateur (`getInventoryByCollaborateur`). Base « en circulation »
   *  (+ filiale) fournie par le prédicat commun `buildParcEquipmentWhere` —
   *  les autres filtres restent spécifiques à cette vue. `now` est injectable
   *  (tests) pour figer le filtre `overdue`. Typé sur `InventoryWhereFilters`
   *  (et non `InventoryQueryDto`) pour rester appelable depuis les deux DTOs
   *  de query sans dupliquer cette construction. */
  private async buildWhere(filters: InventoryWhereFilters, now: Date = new Date()): Promise<Prisma.BonEquipmentWhereInput> {
    // « Non restitué » n'est pas une situation du parc : elle remplace la base
    // (équipements chez les collaborateurs) par les équipements déclarés non
    // restitués et pas retrouvés — la liste de la carte « Encore non restitués ».
    const notReturned = filters.situation === NOT_RETURNED_SITUATION;
    const base = notReturned
      ? buildNotReturnedEquipmentWhere({ filialeId: filters.filialeId })
      : buildParcEquipmentWhere({ filialeId: filters.filialeId });
    const and: Prisma.BonEquipmentWhereInput[] = [...(base.AND as Prisma.BonEquipmentWhereInput[])];

    if (filters.collaborateurId) {
      and.push({ bon: { collaborateurId: filters.collaborateurId } });
    }
    if (filters.compte) {
      // Lot D1 (départ d'un collaborateur) : « en départ » = compte désactivé
      // (?compte=inactif) qui détient encore du matériel — cf.
      // InventoryByCollaborateurQueryDto et departure-notifications.ts (LDAP),
      // qui réutilise ce même where pour l'alerte email.
      and.push({ bon: { collaborateur: { active: filters.compte === 'actif' } } });
    }
    if (filters.situation && filters.situation !== NOT_RETURNED_SITUATION) {
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
      // « Retour en retard » : prédicat partagé avec les tuiles de l'accueil
      // et de l'onglet Parc (le parc est déjà dans `and`). Indépendant de
      // `situation` : un équipement en cours ou contesté peut être en retard.
      and.push(...(buildReturnOverdueEquipmentWhere({}, now).AND as Prisma.BonEquipmentWhereInput[]));
    }
    if (filters.sansNumeroSerie) {
      // Qualité des données : absent, vide ou fait d'espaces — même prédicat
      // que la carte « Avec numéro de série » (missingSerialSql).
      and.push(buildMissingSerialWhere(await this.findBlankSerialValues()));
    }
    if (filters.horsCatalogue) {
      and.push(OFF_CATALOG_WHERE);
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
          // Référence du bon : la ligne « Retour en retard » d'un bon ouvre,
          // pour la direction (sans accès aux bons), ses seuls équipements.
          { bon: { reference: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    return { AND: and };
  }

  /** Numéros de série blancs (vides ou faits d'espaces) présents en base :
   *  quelques valeurs distinctes au plus, nommées par le filtre « sans numéro ». */
  private async findBlankSerialValues(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ value: string }[]>(BLANK_SERIAL_VALUES_SQL);
    return rows.map((row) => row.value);
  }

  /** GET /reporting/inventory — forme unique des listes ; `meta.exportLimit`
   *  donne le plafond de l'export, pour que l'écran prévienne avant
   *  d'exporter plus de lignes que le fichier n'en contiendra. */
  async getInventory(query: InventoryListQuery, now: Date = new Date()) {
    const { page, limit } = pageOf(query);
    const where = await this.buildWhere(query, now);

    const [rows, total] = await Promise.all([
      findSortedInventoryRows(this.prisma, where, sortOf(query), query.direction, toPrismaPage({ page, limit })),
      this.prisma.bonEquipment.count({ where }),
    ]);

    const meta: InventoryListMeta = { exportLimit: inventoryExportRowLimit() };
    return toListResponse(rows.map((r) => toInventoryItem(r)), { total, page, limit, meta });
  }

  /**
   * GET /reporting/inventory/by-collaborateur — même parc filtré (`buildWhere`,
   * partagé avec `getInventory`/`getExportCsv`, jamais dupliqué) regroupé par
   * collaborateur : une ligne par personne avec son nombre d'équipements, son
   * nombre de retards et l'ancienneté de son prêt le plus ancien.
   *
   * Le regroupement se fait en mémoire (`groupInventoryByCollaborateur`) sur
   * le jeu déjà filtré plutôt qu'en SQL, plafonné à AGGREGATION_ROW_LIMIT
   * lignes (troncature signalée via `truncated`, jamais silencieuse) — voir
   * inventory-collaborateur-aggregate.ts pour la justification détaillée.
   * Pagination et tri (`count`/`oldest`) sont appliqués après regroupement,
   * sur les collaborateurs (pas sur les équipements).
   */
  async getInventoryByCollaborateur(query: InventoryByCollaborateurQuery, now: Date = new Date()) {
    const { page, limit } = pageOf(query);
    const where = await this.buildWhere(query, now);

    const rows = await this.prisma.bonEquipment.findMany({
      where,
      select: COLLABORATEUR_GROUP_SELECT,
      take: AGGREGATION_ROW_LIMIT + 1,
    });

    const truncated = rows.length > AGGREGATION_ROW_LIMIT;
    const usableRows = truncated ? rows.slice(0, AGGREGATION_ROW_LIMIT) : rows;

    const sorted = sortCollaborateurGroups(groupInventoryByCollaborateur(usableRows, now), query.sort);
    const { skip, take } = toPrismaPage({ page, limit });

    return toListResponse(sorted.slice(skip, skip + take), { total: sorted.length, page, limit, truncated });
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
   * `notReturned` : équipements encore non restitués, hors parc (option
   * « Non restitué » du filtre de situation). `overdueReturns` : « Retour en
   * retard » ; `overdue`, même valeur, reste servi pendant la vague 3.
   */
  async getSummary() {
    const [totalRows, byCategoryRows, byFilialeRows, bySituationRows, overdueRows, notReturnedRows] = await Promise.all([
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
        WHERE ${returnOverdueEquipmentSql()}
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE ${notReturnedEquipmentSql()}
      `),
    ]);

    const overdueReturns = Number(overdueRows[0]?.count ?? 0);
    return {
      total: Number(totalRows[0]?.count ?? 0),
      byCategory: byCategoryRows.map((r) => ({
        category: r.category,
        label: categoryLabel(r.category),
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
      overdueReturns,
      overdue: overdueReturns,
      notReturned: Number(notReturnedRows[0]?.count ?? 0),
    };
  }

  /**
   * GET /reporting/inventory/export — CSV complet (mêmes filtres et même tri
   * que la liste — `findSortedInventoryRows`, partagé —, sans pagination),
   * plafonné à `inventoryExportRowLimit()` lignes (10 000 par défaut) : une
   * ligne de plus est lue pour savoir si le fichier est coupé.
   * `now` est injectable (tests) pour figer le filtre `overdue` et les
   * colonnes calculées (ancienneté, retard) — voir inventory-csv.ts.
   */
  async getExportCsv(
    query: InventoryListQuery,
    now: Date = new Date(),
    rowLimit: number = inventoryExportRowLimit(),
  ): Promise<{ csv: string; truncated: boolean }> {
    const where = await this.buildWhere(query, now);
    const rows = await findSortedInventoryRows(this.prisma, where, sortOf(query), query.direction, {
      skip: 0,
      take: rowLimit + 1,
    });

    const truncated = rows.length > rowLimit;
    const items = (truncated ? rows.slice(0, rowLimit) : rows).map((r) => toInventoryItem(r));

    return { csv: buildInventoryCsv(items, now), truncated };
  }
}
