import { EquipmentCatalog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PackItemDto, UpdateCatalogItemDto, UpdatePackDto } from './dto/equipment.dto';

// ── Catalogue ────────────────────────────────────────────────────────────
//
// Journal d'audit du catalogue et des packs, dans le même style que
// backend/src/bons/workflow/bon-crud.ts : une action en snake_case, un
// `details` JSON avec les valeurs utiles, et le `userId` de l'appelant.

// `string | null` couvre tous les champs diffés ici (catégorie, marque,
// modèle, description, nom de pack) — types concrets attendus par le champ
// Json `AuditLog.details` (Prisma.InputJsonValue n'accepte pas `unknown`).
type FieldChanges = Record<string, { before: string | null; after: string | null }>;

function summarizeCatalogItem(item: Pick<EquipmentCatalog, 'id' | 'category' | 'brand' | 'model'>) {
  return { catalogItemId: item.id, category: item.category, brand: item.brand, model: item.model };
}

export async function recordCatalogItemCreated(
  prisma: PrismaService,
  item: EquipmentCatalog,
  userId: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: { userId, action: 'catalog_item_created', details: summarizeCatalogItem(item) },
  });
}

export async function recordCatalogItemDisabled(
  prisma: PrismaService,
  item: Pick<EquipmentCatalog, 'id' | 'category' | 'brand' | 'model'>,
  userId: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: { userId, action: 'catalog_item_disabled', details: summarizeCatalogItem(item) },
  });
}

/**
 * Journalise les effets d'un `updateCatalogItem` : une transition `active`
 * (désactivé/réactivé) d'une part, une modification de champ (catégorie,
 * marque, modèle, description) de l'autre — les deux peuvent survenir dans
 * le même appel et produisent alors deux entrées distinctes.
 */
export async function recordCatalogItemUpdate(
  prisma: PrismaService,
  existing: EquipmentCatalog,
  dto: UpdateCatalogItemDto,
  userId: string,
): Promise<void> {
  if (dto.active === false && existing.active !== false) {
    await recordCatalogItemDisabled(prisma, existing, userId);
  } else if (dto.active === true && existing.active === false) {
    await prisma.auditLog.create({
      data: { userId, action: 'catalog_item_reactivated', details: summarizeCatalogItem(existing) },
    });
  }

  const changes: FieldChanges = {};
  (['category', 'brand', 'model', 'description'] as const).forEach((field) => {
    const next = dto[field];
    if (next !== undefined && next !== existing[field]) {
      changes[field] = { before: existing[field], after: next };
    }
  });

  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: { userId, action: 'catalog_item_updated', details: { catalogItemId: existing.id, changes } },
    });
  }
}

// ── Packs ────────────────────────────────────────────────────────────────

interface PackSummaryFields {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

interface PackItemSnapshot {
  catalogItemId: string;
  quantity: number;
}

export async function recordPackCreated(
  prisma: PrismaService,
  pack: PackSummaryFields,
  items: PackItemDto[] | undefined,
  userId: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'pack_created',
      details: {
        packId: pack.id,
        name: pack.name,
        items: (items ?? []).map((item) => ({ catalogItemId: item.catalogItemId, quantity: item.quantity ?? 1 })),
      },
    },
  });
}

export async function recordPackDisabled(prisma: PrismaService, pack: PackSummaryFields, userId: string): Promise<void> {
  await prisma.auditLog.create({
    data: { userId, action: 'pack_disabled', details: { packId: pack.id, name: pack.name } },
  });
}

/** Diff des items d'un pack entre l'état existant et les items fournis à
 *  `updatePack` : ajoutés / retirés / quantité modifiée. */
function diffPackItems(existingItems: PackItemSnapshot[], newItems: PackItemDto[]) {
  const existingByCatalogId = new Map(existingItems.map((item) => [item.catalogItemId, item.quantity]));
  const newByCatalogId = new Map(newItems.map((item) => [item.catalogItemId, item.quantity ?? 1]));

  const added = [...newByCatalogId.keys()].filter((id) => !existingByCatalogId.has(id));
  const removed = [...existingByCatalogId.keys()].filter((id) => !newByCatalogId.has(id));
  const quantityChanged = [...newByCatalogId.entries()]
    .filter(([id, quantity]) => existingByCatalogId.has(id) && existingByCatalogId.get(id) !== quantity)
    .map(([catalogItemId, quantity]) => ({
      catalogItemId,
      before: existingByCatalogId.get(catalogItemId) as number,
      after: quantity,
    }));

  return { added, removed, quantityChanged };
}

/**
 * Journalise les effets d'un `updatePack` : transition `active`
 * (désactivé/réactivé), modification de champ (nom, description), et/ou
 * modification de la liste d'items (ajout/retrait/quantité) — chacun produit
 * sa propre entrée d'audit lorsqu'il s'est produit.
 */
export async function recordPackUpdate(
  prisma: PrismaService,
  existing: PackSummaryFields & { items: PackItemSnapshot[] },
  dto: UpdatePackDto,
  userId: string,
): Promise<void> {
  if (dto.active === false && existing.active !== false) {
    await recordPackDisabled(prisma, existing, userId);
  } else if (dto.active === true && existing.active === false) {
    await prisma.auditLog.create({
      data: { userId, action: 'pack_reactivated', details: { packId: existing.id, name: existing.name } },
    });
  }

  const changes: FieldChanges = {};
  if (dto.name !== undefined && dto.name !== existing.name) {
    changes.name = { before: existing.name, after: dto.name };
  }
  if (dto.description !== undefined && dto.description !== existing.description) {
    changes.description = { before: existing.description, after: dto.description };
  }
  if (Object.keys(changes).length > 0) {
    await prisma.auditLog.create({
      data: { userId, action: 'pack_updated', details: { packId: existing.id, changes } },
    });
  }

  if (dto.items !== undefined) {
    const itemsDiff = diffPackItems(existing.items, dto.items);
    if (itemsDiff.added.length > 0 || itemsDiff.removed.length > 0 || itemsDiff.quantityChanged.length > 0) {
      await prisma.auditLog.create({
        data: { userId, action: 'pack_items_changed', details: { packId: existing.id, ...itemsDiff } },
      });
    }
  }
}
