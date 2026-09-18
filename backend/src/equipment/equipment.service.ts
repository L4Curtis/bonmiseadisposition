import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EquipmentCatalog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto, ImportCatalogDto, ImportCatalogResult,
} from './dto/equipment.dto';
import { trimOptionalOrUndefined, trimRequired } from './equipment-validation';
import {
  recordCatalogItemCreated, recordCatalogItemDisabled, recordCatalogItemUpdate,
  recordPackCreated, recordPackDisabled, recordPackUpdate,
} from './equipment-audit';
import { importCatalogItems } from './equipment-catalog-import';

/** Limite de lignes renvoyées par getSerialHistory — au-delà, `truncated:
 *  true` signale explicitement que le résultat est partiel plutôt que de
 *  tronquer silencieusement. */
const SERIAL_HISTORY_LIMIT = 200;

/** Plafond du nombre de numéros de série vérifiés en une seule fois par
 *  findSerialConflicts — garde-fou contre une requête IN() démesurée. */
const SERIAL_CONFLICTS_LIMIT = 50;

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Numéros de série ───────────────────────────────────────

  /** Statuts pour lesquels un équipement non rendu est considéré « en circulation ». */
  private static readonly ACTIVE_BON_STATUSES = [
    'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
  ] as const;

  /**
   * Historique d'un numéro de série : tous les bons où il apparaît, du plus
   * récent au plus ancien (limité à SERIAL_HISTORY_LIMIT ; `truncated`
   * indique explicitement si des résultats plus anciens ont été omis).
   * Répond à « où est le portable SN-1234 ? ».
   */
  async getSerialHistory(serialNumber: string) {
    const query = (serialNumber ?? '').trim();
    if (!query) return { items: [], truncated: false, total: 0 };

    const where: Prisma.BonEquipmentWhereInput = { serialNumber: { equals: query, mode: 'insensitive' } };
    const [total, entries] = await Promise.all([
      this.prisma.bonEquipment.count({ where }),
      this.prisma.bonEquipment.findMany({
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
  async findSerialConflicts(serials: string[], excludeBonId?: string) {
    const distinct = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
    const truncated = distinct.length > SERIAL_CONFLICTS_LIMIT;
    const cleaned = distinct.slice(0, SERIAL_CONFLICTS_LIMIT);
    if (cleaned.length === 0) return { items: [], truncated: false };

    const conflicts = await this.prisma.bonEquipment.findMany({
      where: {
        serialNumber: { in: cleaned, mode: 'insensitive' },
        returnedAt: null,
        notReturned: false,
        bon: {
          status: { in: [...EquipmentService.ACTIVE_BON_STATUSES] },
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

  // ── Catalogue ──────────────────────────────────────────────

  findAllCatalog() {
    return this.prisma.equipmentCatalog.findMany({
      orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
    });
  }

  findActiveCatalog() {
    return this.prisma.equipmentCatalog.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
    });
  }

  async searchCatalog(query: string) {
    return this.prisma.equipmentCatalog.findMany({
      where: {
        active: true,
        OR: [
          { brand: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  async findOneCatalog(id: string) {
    const item = await this.prisma.equipmentCatalog.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Équipement introuvable');
    return item;
  }

  async createCatalogItem(dto: CreateCatalogItemDto, userId: string) {
    const data = {
      category: dto.category,
      brand: trimRequired(dto.brand, 'La marque'),
      model: trimRequired(dto.model, 'Le modèle'),
      description: trimOptionalOrUndefined(dto.description),
    };

    let created: EquipmentCatalog;
    try {
      created = await this.prisma.equipmentCatalog.create({ data });
    } catch (error: unknown) {
      this.throwIfDuplicateCatalogItem(error);
    }

    await recordCatalogItemCreated(this.prisma, created, userId);
    return created;
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto, userId: string) {
    const existing = await this.findOneCatalog(id);

    const normalizedDto: UpdateCatalogItemDto = {
      ...dto,
      brand: dto.brand !== undefined ? trimRequired(dto.brand, 'La marque') : undefined,
      model: dto.model !== undefined ? trimRequired(dto.model, 'Le modèle') : undefined,
      description: trimOptionalOrUndefined(dto.description),
    };

    // brand/model/category identifient l'article sur les bons déjà émis
    // (PDF, preuves signées) : les modifier a posteriori romprait la
    // cohérence entre le document signé et le catalogue. Seuls les articles
    // non référencés par un bon sorti de l'état draft peuvent être modifiés
    // sur ces champs ; description/autres champs restent libres.
    const changesIdentity = normalizedDto.category !== undefined || normalizedDto.brand !== undefined || normalizedDto.model !== undefined;
    if (changesIdentity) {
      const referencedBySignedBon = await this.prisma.bonEquipment.count({
        where: {
          catalogItemId: id,
          bon: { status: { not: 'draft' } },
        },
      });
      if (referencedBySignedBon > 0) {
        throw new BadRequestException(
          'Article référencé par des bons signés : créez un nouvel article plutôt que de modifier celui-ci.',
        );
      }
    }

    // `active` reste accepté par ce endpoint (le frontend réactive via
    // PUT { active: true }) : seule une transition true → false doit passer
    // par la même garde que removeCatalogItem, sinon un simple PUT
    // contournerait la vérification « référencé sur N bons/packs actifs ».
    // La réactivation (false → true, ou active absent du body) reste libre.
    if (normalizedDto.active === false && existing.active !== false) {
      await this.assertNotReferencedForDeactivation(id);
    }

    let updated: EquipmentCatalog;
    try {
      updated = await this.prisma.equipmentCatalog.update({ where: { id }, data: normalizedDto });
    } catch (error: unknown) {
      this.throwIfDuplicateCatalogItem(error);
    }

    await recordCatalogItemUpdate(this.prisma, existing, normalizedDto, userId);
    return updated;
  }

  async removeCatalogItem(id: string, userId: string) {
    const existing = await this.findOneCatalog(id);
    await this.assertNotReferencedForDeactivation(id);
    const updated = await this.prisma.equipmentCatalog.update({ where: { id }, data: { active: false } });
    await recordCatalogItemDisabled(this.prisma, existing, userId);
    return updated;
  }

  /**
   * Import en masse (POST /equipment/catalog/import) : voir
   * equipment-catalog-import.ts pour le détail du contrat et du comportement
   * (skip / update / create / erreur par ligne, sans jamais interrompre le lot).
   */
  async importCatalog(dto: ImportCatalogDto, userId: string): Promise<ImportCatalogResult> {
    return importCatalogItems(this.prisma, dto.items, userId);
  }

  /**
   * Traduit une violation de la contrainte d'unicité (category, brand, model)
   * — code Prisma P2002 — en 400 explicite plutôt que de laisser remonter un
   * 500 générique. Toute autre erreur est repropagée telle quelle.
   */
  private throwIfDuplicateCatalogItem(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Cet article (catégorie / marque / modèle) existe déjà.');
    }
    throw error;
  }

  /**
   * Garde partagée entre removeCatalogItem (DELETE) et updateCatalogItem
   * (PUT { active: false }) : un article ne peut être désactivé ni s'il est
   * référencé sur un bon actif, ni s'il figure dans un pack actif.
   */
  private async assertNotReferencedForDeactivation(id: string): Promise<void> {
    const activeBonCount = await this.prisma.bonEquipment.count({
      where: {
        catalogItemId: id,
        bon: { status: { notIn: ['cancelled', 'archived'] } },
      },
    });
    if (activeBonCount > 0) {
      throw new BadRequestException(
        `Cet équipement est référencé sur ${activeBonCount} bon(s) actif(s) et ne peut pas être désactivé.`,
      );
    }

    const activePackCount = await this.prisma.equipmentPackItem.count({
      where: {
        catalogItemId: id,
        pack: { active: true },
      },
    });
    if (activePackCount > 0) {
      throw new BadRequestException(
        `Cet article est présent dans ${activePackCount} pack(s) actif(s) et ne peut pas être désactivé.`,
      );
    }
  }

  /**
   * Vérifie que chaque id de catalogue fourni existe et est actif — appelé
   * avant toute création/mise à jour de pack pour empêcher qu'un pack
   * référence un article inexistant ou désactivé (le pack deviendrait
   * incomplet silencieusement à l'usage).
   */
  private async assertCatalogItemsActive(catalogItemIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(catalogItemIds)];
    if (uniqueIds.length === 0) return;

    const items = await this.prisma.equipmentCatalog.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, active: true },
    });
    const activeById = new Map(items.map((item) => [item.id, item.active]));
    const invalidIds = uniqueIds.filter((id) => activeById.get(id) !== true);

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Article(s) de catalogue introuvable(s) ou inactif(s) : ${invalidIds.join(', ')}`,
      );
    }
  }

  // ── Packs ──────────────────────────────────────────────────

  findAllPacks() {
    return this.prisma.equipmentPack.findMany({
      include: {
        items: {
          include: { catalogItem: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findActivePacks() {
    return this.prisma.equipmentPack.findMany({
      where: { active: true },
      include: {
        items: {
          include: { catalogItem: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOnePack(id: string) {
    const pack = await this.prisma.equipmentPack.findUnique({
      where: { id },
      include: {
        items: {
          include: { catalogItem: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!pack) throw new NotFoundException('Pack introuvable');
    return pack;
  }

  async createPack(dto: CreatePackDto, userId: string) {
    const { items, ...packData } = dto;
    const data = {
      ...packData,
      name: trimRequired(dto.name, 'Le nom du pack'),
      description: trimOptionalOrUndefined(dto.description),
    };
    if (items && items.length > 0) {
      await this.assertCatalogItemsActive(items.map((item) => item.catalogItemId));
    }
    const created = await this.prisma.equipmentPack.create({
      data: {
        ...data,
        items: items
          ? {
              create: items.map((item, index) => ({
                catalogItemId: item.catalogItemId,
                quantity: item.quantity ?? 1,
                order: item.order ?? index,
              })),
            }
          : undefined,
      },
      include: { items: { include: { catalogItem: true } } },
    });

    await recordPackCreated(this.prisma, created, items, userId);
    return created;
  }

  async updatePack(id: string, dto: UpdatePackDto, userId: string) {
    const existing = await this.findOnePack(id);
    const normalizedDto: UpdatePackDto = {
      ...dto,
      name: dto.name !== undefined ? trimRequired(dto.name, 'Le nom du pack') : undefined,
      description: trimOptionalOrUndefined(dto.description),
    };
    const { items, ...normalizedPackData } = normalizedDto;
    if (items && items.length > 0) {
      await this.assertCatalogItemsActive(items.map((item) => item.catalogItemId));
    }

    // Atomic transaction: delete old items + create new + update pack metadata
    const updated = await this.prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await tx.equipmentPackItem.deleteMany({ where: { packId: id } });
        await tx.equipmentPackItem.createMany({
          data: items.map((item, index) => ({
            packId: id,
            catalogItemId: item.catalogItemId,
            quantity: item.quantity ?? 1,
            order: item.order ?? index,
          })),
        });
      }

      return tx.equipmentPack.update({
        where: { id },
        data: normalizedPackData,
        include: { items: { include: { catalogItem: true } } },
      });
    });

    const existingSnapshot = {
      id: existing.id,
      name: existing.name,
      description: existing.description,
      active: existing.active,
      items: existing.items.map((item) => ({ catalogItemId: item.catalogItemId, quantity: item.quantity })),
    };
    await recordPackUpdate(this.prisma, existingSnapshot, normalizedDto, userId);
    return updated;
  }

  async removePack(id: string, userId: string) {
    const existing = await this.findOnePack(id);
    const updated = await this.prisma.equipmentPack.update({ where: { id }, data: { active: false } });
    await recordPackDisabled(this.prisma, existing, userId);
    return updated;
  }
}
