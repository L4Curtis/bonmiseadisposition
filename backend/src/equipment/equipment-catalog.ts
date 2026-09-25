import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EquipmentCatalog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './dto/equipment.dto';
import { trimOptionalOrUndefined, trimRequired } from './equipment-validation';
import { recordCatalogItemCreated, recordCatalogItemDisabled, recordCatalogItemUpdate } from './equipment-audit';
import { CLOSED_BON_STATUSES } from '../bons/bon-status';

export function findAllCatalog(prisma: PrismaService) {
  return prisma.equipmentCatalog.findMany({
    orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
  });
}

export function findActiveCatalog(prisma: PrismaService) {
  return prisma.equipmentCatalog.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
  });
}

export async function searchCatalog(prisma: PrismaService, query: string) {
  return prisma.equipmentCatalog.findMany({
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

export async function findOneCatalog(prisma: PrismaService, id: string) {
  const item = await prisma.equipmentCatalog.findUnique({ where: { id } });
  if (!item) throw new NotFoundException('Équipement introuvable');
  return item;
}

export async function createCatalogItem(prisma: PrismaService, dto: CreateCatalogItemDto, userId: string) {
  const data = {
    category: dto.category,
    brand: trimRequired(dto.brand, 'La marque'),
    model: trimRequired(dto.model, 'Le modèle'),
    description: trimOptionalOrUndefined(dto.description),
  };

  let created: EquipmentCatalog;
  try {
    created = await prisma.equipmentCatalog.create({ data });
  } catch (error: unknown) {
    throwIfDuplicateCatalogItem(error);
  }

  await recordCatalogItemCreated(prisma, created, userId);
  return created;
}

export async function updateCatalogItem(
  prisma: PrismaService,
  id: string,
  dto: UpdateCatalogItemDto,
  userId: string,
) {
  const existing = await findOneCatalog(prisma, id);

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
    const referencedBySignedBon = await prisma.bonEquipment.count({
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
    await assertNotReferencedForDeactivation(prisma, id);
  }

  let updated: EquipmentCatalog;
  try {
    updated = await prisma.equipmentCatalog.update({ where: { id }, data: normalizedDto });
  } catch (error: unknown) {
    throwIfDuplicateCatalogItem(error);
  }

  await recordCatalogItemUpdate(prisma, existing, normalizedDto, userId);
  return updated;
}

export async function removeCatalogItem(prisma: PrismaService, id: string, userId: string) {
  const existing = await findOneCatalog(prisma, id);
  await assertNotReferencedForDeactivation(prisma, id);
  const updated = await prisma.equipmentCatalog.update({ where: { id }, data: { active: false } });
  await recordCatalogItemDisabled(prisma, existing, userId);
  return updated;
}

/**
 * Traduit une violation de la contrainte d'unicité (category, brand, model)
 * — code Prisma P2002 — en 400 explicite plutôt que de laisser remonter un
 * 500 générique. Toute autre erreur est repropagée telle quelle.
 */
function throwIfDuplicateCatalogItem(error: unknown): never {
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
export async function assertNotReferencedForDeactivation(prisma: PrismaService, id: string): Promise<void> {
  const activeBonCount = await prisma.bonEquipment.count({
    where: {
      catalogItemId: id,
      bon: { status: { notIn: [...CLOSED_BON_STATUSES] } },
    },
  });
  if (activeBonCount > 0) {
    throw new BadRequestException(
      `Cet équipement est référencé sur ${activeBonCount} bon(s) actif(s) et ne peut pas être désactivé.`,
    );
  }

  const activePackCount = await prisma.equipmentPackItem.count({
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
