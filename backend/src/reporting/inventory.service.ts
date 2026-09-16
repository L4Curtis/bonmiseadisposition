import { Injectable } from '@nestjs/common';
import { Prisma, EquipmentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABELS } from '../common/status-labels';
import { InventoryQueryDto, InventorySortField } from './dto/inventory-query.dto';

/** Statuts de bon pour lesquels un équipement non rendu est considéré
 *  « prêté » (entre les mains du collaborateur). */
export const LOANED_BON_STATUSES = ['active', 'sent_restitution', 'partially_returned'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  pc_portable: 'PC portable',
  pc_fixe: 'PC fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Station d’accueil',
  cable: 'Câble',
  autre: 'Autre',
};

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
export const EXPORT_ROW_LIMIT = 10000;

/** Échappement CSV : neutralise l'injection de formule (Excel/LibreOffice
 *  exécutent une cellule commençant par = + - @) et les guillemets internes. */
export function escapeCsvCell(value: string): string {
  let s = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s}"`;
}

const ITEM_SELECT = {
  id: true,
  customLabel: true,
  serialNumber: true,
  inventoryNumber: true,
  catalogItem: { select: { category: true, brand: true, model: true } },
  bon: {
    select: {
      id: true,
      reference: true,
      status: true,
      dateMiseDisposition: true,
      dateRestitution: true,
      collaborateur: { select: { id: true, displayName: true, email: true, department: true } },
      filiale: { select: { id: true, name: true, displayName: true } },
    },
  },
} satisfies Prisma.BonEquipmentSelect;

type InventoryRow = Prisma.BonEquipmentGetPayload<{ select: typeof ITEM_SELECT }>;

/**
 * Vue « Inventaire du parc prêté » : liste, résumé agrégé et export CSV des
 * équipements actuellement entre les mains des collaborateurs.
 *
 * Définition « prêté » : BonEquipment dont le bon a un statut ∈
 * LOANED_BON_STATUSES, returnedAt IS NULL et notReturned = false.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Where partagé par la liste paginée et l'export CSV. */
  private buildWhere(filters: InventoryQueryDto): Prisma.BonEquipmentWhereInput {
    const and: Prisma.BonEquipmentWhereInput[] = [
      { returnedAt: null },
      { notReturned: false },
      { bon: { status: { in: [...LOANED_BON_STATUSES] } } },
    ];

    if (filters.filialeId) {
      and.push({ bon: { filialeId: filters.filialeId } });
    }
    if (filters.collaborateurId) {
      and.push({ bon: { collaborateurId: filters.collaborateurId } });
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

  private buildOrderBy(sort?: InventorySortField): Prisma.BonEquipmentOrderByWithRelationInput {
    switch (sort) {
      case 'collaborateur':
        return { bon: { collaborateur: { displayName: 'asc' } } };
      case 'category':
        return { catalogItem: { category: 'asc' } };
      case 'dateMiseDisposition':
      default:
        return { bon: { dateMiseDisposition: 'desc' } };
    }
  }

  private toItem(row: InventoryRow) {
    const category = row.catalogItem?.category ?? EquipmentCategory.autre;
    const label = row.catalogItem
      ? `${row.catalogItem.brand} ${row.catalogItem.model}`
      : row.customLabel ?? 'Équipement';

    return {
      equipmentId: row.id,
      label,
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      serialNumber: row.serialNumber,
      inventoryNumber: row.inventoryNumber,
      bonId: row.bon.id,
      bonReference: row.bon.reference,
      bonStatus: row.bon.status,
      dateMiseDisposition: row.bon.dateMiseDisposition,
      dateRestitution: row.bon.dateRestitution,
      collaborateur: row.bon.collaborateur,
      filiale: row.bon.filiale,
    };
  }

  /** GET /reporting/inventory */
  async getInventory(query: InventoryQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.bonEquipment.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: this.buildOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bonEquipment.count({ where }),
    ]);

    return { items: rows.map((r) => this.toItem(r)), total, page, limit };
  }

  /**
   * GET /reporting/inventory/summary — agrégats calculés en SQL (GROUP BY /
   * COUNT côté base), jamais en itérant tout le parc en JS.
   *
   * `b.status::text` : la colonne est un enum Postgres ("BonStatus") et
   * $queryRaw lie les valeurs de Prisma.join comme des paramètres text. Sans
   * le cast, Postgres refuse la comparaison (« operator does not exist:
   * "BonStatus" = text ») — invisible dans les tests unitaires où $queryRaw
   * est mocké, mais fatal en production (résumé jamais chargé).
   */
  async getSummary() {
    const [totalRows, byCategoryRows, byFilialeRows, overdueRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE be.returned_at IS NULL
          AND be.not_returned = false
          AND b.status::text IN (${Prisma.join(LOANED_BON_STATUSES)})
      `),
      this.prisma.$queryRaw<{ category: string; count: bigint }[]>(Prisma.sql`
        SELECT COALESCE(ec.category::text, 'autre') AS category, COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        LEFT JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
        WHERE be.returned_at IS NULL
          AND be.not_returned = false
          AND b.status::text IN (${Prisma.join(LOANED_BON_STATUSES)})
        GROUP BY COALESCE(ec.category::text, 'autre')
        ORDER BY count DESC
      `),
      this.prisma.$queryRaw<{ filialeId: string; name: string; count: bigint }[]>(Prisma.sql`
        SELECT f.id AS "filialeId", f.display_name AS name, COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        JOIN filiales f ON f.id = b.filiale_id
        WHERE be.returned_at IS NULL
          AND be.not_returned = false
          AND b.status::text IN (${Prisma.join(LOANED_BON_STATUSES)})
        GROUP BY f.id, f.display_name
        ORDER BY count DESC
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        WHERE be.returned_at IS NULL
          AND be.not_returned = false
          AND b.status::text IN (${Prisma.join(LOANED_BON_STATUSES)})
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
      overdue: Number(overdueRows[0]?.count ?? 0),
    };
  }

  /**
   * GET /reporting/inventory/export — CSV complet (mêmes filtres que la
   * liste, sans pagination), plafonné à EXPORT_ROW_LIMIT lignes.
   */
  async getExportCsv(query: InventoryQueryDto): Promise<{ csv: string; truncated: boolean }> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.bonEquipment.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: this.buildOrderBy(query.sort),
      take: EXPORT_ROW_LIMIT + 1,
    });

    const truncated = rows.length > EXPORT_ROW_LIMIT;
    const items = (truncated ? rows.slice(0, EXPORT_ROW_LIMIT) : rows).map((r) => this.toItem(r));

    const headers = [
      'Équipement', 'Catégorie', 'N° série', 'N° inventaire',
      'Collaborateur', 'Email', 'Service', 'Filiale',
      'Référence bon', 'Statut bon', 'Date mise à disposition', 'Date restitution prévue',
    ];
    const dataRows = items.map((it) =>
      [
        it.label,
        it.categoryLabel,
        it.serialNumber ?? '',
        it.inventoryNumber ?? '',
        it.collaborateur.displayName,
        it.collaborateur.email,
        it.collaborateur.department ?? '',
        it.filiale.displayName,
        it.bonReference,
        STATUS_LABELS[it.bonStatus] ?? it.bonStatus,
        it.dateMiseDisposition ? new Date(it.dateMiseDisposition).toLocaleDateString('fr-FR') : '',
        it.dateRestitution ? new Date(it.dateRestitution).toLocaleDateString('fr-FR') : '',
      ].map(escapeCsvCell),
    );

    const csv = [headers.map(escapeCsvCell).join(';'), ...dataRows.map((r) => r.join(';'))].join('\n');
    // BOM UTF-8 (U+FEFF) pour Excel — via fromCharCode pour éviter tout
    // caractère littéral invisible dans le source.
    return { csv: String.fromCharCode(0xfeff) + csv, truncated };
  }
}
