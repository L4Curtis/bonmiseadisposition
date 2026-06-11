import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const query = serialNumber.trim();
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

  createCatalogItem(dto: CreateCatalogItemDto) {
    return this.prisma.equipmentCatalog.create({ data: dto });
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto) {
    await this.findOneCatalog(id);
    return this.prisma.equipmentCatalog.update({ where: { id }, data: dto });
  }

  async removeCatalogItem(id: string) {
    await this.findOneCatalog(id);
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
    return this.prisma.equipmentCatalog.update({ where: { id }, data: { active: false } });
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
