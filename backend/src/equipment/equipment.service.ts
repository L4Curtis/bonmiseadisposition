import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto,
} from './dto/equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (items !== undefined) {
      // Replace all items
      await this.prisma.equipmentPackItem.deleteMany({ where: { packId: id } });
      await this.prisma.equipmentPackItem.createMany({
        data: items.map((item, index) => ({
          packId: id,
          catalogItemId: item.catalogItemId,
          quantity: item.quantity ?? 1,
          order: item.order ?? index,
        })),
      });
    }

    return this.prisma.equipmentPack.update({
      where: { id },
      data: packData,
      include: { items: { include: { catalogItem: true } } },
    });
  }

  async removePack(id: string) {
    await this.findOnePack(id);
    return this.prisma.equipmentPack.update({ where: { id }, data: { active: false } });
  }
}
