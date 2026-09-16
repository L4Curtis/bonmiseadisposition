import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto,
} from './dto/equipment.dto';

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
   * récent au plus ancien. Répond à « où est le portable SN-1234 ? ».
   */
  async getSerialHistory(serialNumber: string) {
    const query = (serialNumber ?? '').trim();
    if (!query) return [];
    const entries = await this.prisma.bonEquipment.findMany({
      where: { serialNumber: { equals: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
    });
    return entries.map((e) => ({
      equipmentId: e.id,
      serialNumber: e.serialNumber,
      label: e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : e.customLabel,
      returnedAt: e.returnedAt,
      notReturned: e.notReturned,
      bon: e.bon,
    }));
  }

  /**
   * Conflits de numéros de série : pour chaque numéro fourni, les bons « en
   * circulation » où il figure déjà sans avoir été rendu. Avertissement non
   * bloquant à la création/édition d'un bon (l'IT confirme en connaissance).
   */
  async findSerialConflicts(serials: string[], excludeBonId?: string) {
    const cleaned = [...new Set(serials.map((s) => s.trim()).filter(Boolean))].slice(0, 50);
    if (cleaned.length === 0) return [];

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

    return conflicts.map((c) => ({
      serialNumber: c.serialNumber,
      bonId: c.bon.id,
      bonReference: c.bon.reference,
      bonStatus: c.bon.status,
      collaborateur: c.bon.collaborateur?.displayName ?? '—',
    }));
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

  async createCatalogItem(dto: CreateCatalogItemDto) {
    try {
      return await this.prisma.equipmentCatalog.create({ data: dto });
    } catch (error: unknown) {
      this.throwIfDuplicateCatalogItem(error);
    }
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto) {
    const existing = await this.findOneCatalog(id);

    // brand/model/category identifient l'article sur les bons déjà émis
    // (PDF, preuves signées) : les modifier a posteriori romprait la
    // cohérence entre le document signé et le catalogue. Seuls les articles
    // non référencés par un bon sorti de l'état draft peuvent être modifiés
    // sur ces champs ; description/autres champs restent libres.
    const changesIdentity = dto.category !== undefined || dto.brand !== undefined || dto.model !== undefined;
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
    if (dto.active === false && existing.active !== false) {
      await this.assertNotReferencedForDeactivation(id);
    }

    try {
      return await this.prisma.equipmentCatalog.update({ where: { id }, data: dto });
    } catch (error: unknown) {
      this.throwIfDuplicateCatalogItem(error);
    }
  }

  async removeCatalogItem(id: string) {
    await this.findOneCatalog(id);
    await this.assertNotReferencedForDeactivation(id);
    return this.prisma.equipmentCatalog.update({ where: { id }, data: { active: false } });
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

  async createPack(dto: CreatePackDto) {
    const { items, ...packData } = dto;
    if (items && items.length > 0) {
      await this.assertCatalogItemsActive(items.map((item) => item.catalogItemId));
    }
    return this.prisma.equipmentPack.create({
      data: {
        ...packData,
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
  }

  async updatePack(id: string, dto: UpdatePackDto) {
    await this.findOnePack(id);
    const { items, ...packData } = dto;
    if (items && items.length > 0) {
      await this.assertCatalogItemsActive(items.map((item) => item.catalogItemId));
    }

    // Atomic transaction: delete old items + create new + update pack metadata
    return this.prisma.$transaction(async (tx) => {
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
        data: packData,
        include: { items: { include: { catalogItem: true } } },
      });
    });
  }

  async removePack(id: string) {
    await this.findOnePack(id);
    return this.prisma.equipmentPack.update({ where: { id }, data: { active: false } });
  }
}
