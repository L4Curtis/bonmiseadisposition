import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Vérifie qu'une filiale existe et est active — sinon 404. */
export async function assertFilialeUsable(prisma: PrismaService, filialeId: string): Promise<void> {
  const filiale = await prisma.filiale.findUnique({
    where: { id: filialeId },
    select: { active: true },
  });
  if (!filiale?.active) {
    throw new NotFoundException('Filiale introuvable ou inactive');
  }
}

/** Vérifie que chaque article de catalogue référencé existe et est actif —
 *  sinon 400 listant les ids en cause. */
export async function assertCatalogItemsUsable(prisma: PrismaService, catalogItemIds: string[]): Promise<void> {
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

/** Normalise un équipement fourni par le client : trim des champs texte,
 *  chaîne vide → null. */
export function normalizeEquipmentInput(
  e: { catalogItemId?: string; customLabel?: string; serialNumber?: string; inventoryNumber?: string; notes?: string; order?: number },
  idx: number,
) {
  const trimOrNull = (v?: string): string | null => {
    const t = v?.trim();
    return t ? t : null;
  };
  return {
    catalogItemId: e.catalogItemId || null,
    customLabel: trimOrNull(e.customLabel),
    serialNumber: trimOrNull(e.serialNumber),
    inventoryNumber: trimOrNull(e.inventoryNumber),
    notes: e.notes || null,
    order: e.order ?? idx,
  };
}

/** Rejette les numéros de série dupliqués (trim, insensible à la casse) au
 *  sein d'un même bon. */
export function assertNoDuplicateSerials(equipments: Array<{ serialNumber: string | null }>): void {
  const seen = new Set<string>();
  for (const e of equipments) {
    if (!e.serialNumber) continue;
    const key = e.serialNumber.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException(`Numéro de série en double dans ce bon : ${e.serialNumber}`);
    }
    seen.add(key);
  }
}

/** Un bon est « envoyable » (send() ou initiation présentielle mise à
 *  disposition) si : au moins un équipement, chaque équipement référence un
 *  article du catalogue OU une désignation libre, le collaborateur est actif
 *  et la filiale est active. */
export async function assertSendable(
  prisma: PrismaService,
  bon: {
    collaborateurId: string;
    filiale: { active: boolean } | null;
    equipments: Array<{ catalogItemId: string | null; customLabel: string | null }>;
  },
): Promise<void> {
  if (bon.equipments.length === 0) {
    throw new BadRequestException('Le bon doit contenir au moins un équipement');
  }
  const hasInvalidEquipment = bon.equipments.some(
    (e) => !e.catalogItemId && !(e.customLabel && e.customLabel.trim()),
  );
  if (hasInvalidEquipment) {
    throw new BadRequestException(
      'Chaque équipement doit référencer un article du catalogue ou une désignation libre',
    );
  }
  if (!bon.filiale?.active) {
    throw new BadRequestException('La filiale est inactive');
  }
  const collaborateur = await prisma.user.findUnique({
    where: { id: bon.collaborateurId },
    select: { active: true },
  });
  if (!collaborateur?.active) {
    throw new BadRequestException('Le collaborateur est désactivé');
  }
}
