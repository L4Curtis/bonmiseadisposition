import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackDto, UpdatePackDto } from './dto/equipment.dto';
import { trimOptionalOrUndefined, trimRequired } from './equipment-validation';
import { recordPackCreated, recordPackDisabled, recordPackUpdate } from './equipment-audit';

export function findAllPacks(prisma: PrismaService) {
  return prisma.equipmentPack.findMany({
    include: {
      items: {
        include: { catalogItem: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export function findActivePacks(prisma: PrismaService) {
  return prisma.equipmentPack.findMany({
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

export async function findOnePack(prisma: PrismaService, id: string) {
  const pack = await prisma.equipmentPack.findUnique({
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

export async function createPack(prisma: PrismaService, dto: CreatePackDto, userId: string) {
  const { items, ...packData } = dto;
  const data = {
    ...packData,
    name: trimRequired(dto.name, 'Le nom du pack'),
    description: trimOptionalOrUndefined(dto.description),
  };
  if (items && items.length > 0) {
    await assertCatalogItemsActive(prisma, items.map((item) => item.catalogItemId));
  }
  const created = await prisma.equipmentPack.create({
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

  await recordPackCreated(prisma, created, items, userId);
  return created;
}

export async function updatePack(prisma: PrismaService, id: string, dto: UpdatePackDto, userId: string) {
  const existing = await findOnePack(prisma, id);
  const normalizedDto: UpdatePackDto = {
    ...dto,
    name: dto.name !== undefined ? trimRequired(dto.name, 'Le nom du pack') : undefined,
    description: trimOptionalOrUndefined(dto.description),
  };
  const { items, ...normalizedPackData } = normalizedDto;
  if (items && items.length > 0) {
    await assertCatalogItemsActive(prisma, items.map((item) => item.catalogItemId));
  }

  // Atomic transaction: delete old items + create new + update pack metadata
  const updated = await prisma.$transaction(async (tx) => {
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
  await recordPackUpdate(prisma, existingSnapshot, normalizedDto, userId);
  return updated;
}

export async function removePack(prisma: PrismaService, id: string, userId: string) {
  const existing = await findOnePack(prisma, id);
  const updated = await prisma.equipmentPack.update({ where: { id }, data: { active: false } });
  await recordPackDisabled(prisma, existing, userId);
  return updated;
}

/**
 * Vérifie que chaque id de catalogue fourni existe et est actif — appelé
 * avant toute création/mise à jour de pack pour empêcher qu'un pack
 * référence un article inexistant ou désactivé (le pack deviendrait
 * incomplet silencieusement à l'usage).
 */
async function assertCatalogItemsActive(prisma: PrismaService, catalogItemIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(catalogItemIds)];
  if (uniqueIds.length === 0) return;

  const items = await prisma.equipmentCatalog.findMany({
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
