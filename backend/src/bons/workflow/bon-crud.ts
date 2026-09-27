import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateBonDto } from '../dto/bon.dto';
import { Civilite } from '../../common/types';
import { generateBonReference, BON_REFERENCE_TX_OPTIONS } from '../../common/bon-reference';
import { BON_SELECT } from '../queries/bon-where';
import {
  assertFilialeUsable,
  assertCatalogItemsUsable,
  assertNoDuplicateSerials,
  normalizeEquipmentInput,
} from '../validation/bon-validators';
import { BonsWorkflowContext } from './bon-context';

export async function createBon(ctx: BonsWorkflowContext, dto: CreateBonDto, userId: string) {
  const { prisma } = ctx;
  if (dto.dateRestitution && dto.dateRestitution < dto.dateMiseDisposition) {
    throw new BadRequestException(
      'La date de restitution ne peut pas précéder la date de mise à disposition',
    );
  }

  await assertFilialeUsable(prisma, dto.filialeId);

  const collaborateur = await prisma.user.findUnique({
    where: { id: dto.collaborateurId },
  });
  if (!collaborateur) throw new NotFoundException('Collaborateur introuvable');
  if (!collaborateur.active) throw new BadRequestException('Le collaborateur est désactivé');

  let equipments = (dto.equipments || []).map((e, idx) => normalizeEquipmentInput(e, idx));

  // Import from pack if specified
  if (dto.packId) {
    const pack = await prisma.equipmentPack.findUnique({
      where: { id: dto.packId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { catalogItem: true },
        },
      },
    });
    if (!pack || !pack.active) {
      throw new NotFoundException('Pack introuvable ou inactif');
    }
    // Les items dont l'article de catalogue est désactivé sont ignorés à
    // l'import — un pack peut contenir un article devenu inactif entre-temps.
    const activeItems = pack.items.filter((item) => item.catalogItem.active);
    const packEquipments = activeItems.flatMap((item) =>
      Array.from({ length: item.quantity }, (_, i) => ({
        catalogItemId: item.catalogItemId as string | null,
        customLabel: null as string | null,
        serialNumber: null as string | null,
        inventoryNumber: null as string | null,
        notes: null as string | null,
        order: item.order * 10 + i,
      })),
    );
    equipments = [...packEquipments, ...equipments];
  }

  const catalogIds = equipments.map((e) => e.catalogItemId).filter((id): id is string => !!id);
  await assertCatalogItemsUsable(prisma, catalogIds);
  assertNoDuplicateSerials(equipments);

  // Référence et INSERT dans la MÊME transaction : le verrou advisory de
  // generateBonReference est relâché au commit — s'il était relâché avant
  // l'insertion, deux créations concurrentes obtiendraient le même numéro
  // (violation d'unicité P2002 sur la seconde)
  const bon = await prisma.$transaction(async (tx) => {
    const reference = await generateBonReference(tx);
    return tx.bon.create({
      data: {
        reference,
        filialeId: dto.filialeId,
        collaborateurId: dto.collaborateurId,
        collaborateurEmail: collaborateur.email,
        createdById: userId,
        civilite: dto.civilite as Civilite,
        dateMiseDisposition: new Date(dto.dateMiseDisposition),
        dateRestitution: dto.dateRestitution
          ? new Date(dto.dateRestitution)
          : null,
        notes: dto.notes,
        internalNote: blankToNull(dto.internalNote),
        equipments: { create: equipments },
      },
      select: { id: true },
    });
  }, BON_REFERENCE_TX_OPTIONS);
  await rememberCivilite(ctx, dto.collaborateurId, dto.civilite as Civilite);
  await prisma.auditLog.create({
    data: { bonId: bon.id, userId, action: 'bon_created' },
  });
  return bon.id;
}

/** Texte facultatif : '' efface (null), undefined laisse tel quel. */
export function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : value;
}

/** La civilité choisie pour un bon est retenue sur le compte du collaborateur
 *  et proposée au bon suivant (R-002, décision du 25/09). */
export async function rememberCivilite(ctx: BonsWorkflowContext, collaborateurId: string, civilite: Civilite | undefined) {
  if (!civilite) return;
  // `civilite IS NULL` à part : en SQL, NOT (NULL = 'mr') n'est pas vrai.
  await ctx.prisma.user.updateMany({
    where: { id: collaborateurId, OR: [{ civilite: null }, { civilite: { not: civilite } }] },
    data: { civilite },
  });
}

/**
 * Duplique un bon en brouillon (correction après contestation fondée) :
 * mêmes filiale/collaborateur/dates/notes/équipements, nouvelle référence.
 * Le lien avec l'original est tracé dans l'audit des deux bons.
 * Accepte un TransactionClient pour s'inscrire dans la transaction de
 * l'appelant (résolution de contestation) — la référence et l'INSERT restent
 * alors couverts par le même verrou advisory.
 */
export async function duplicateAsDraft(
  ctx: BonsWorkflowContext,
  sourceBonId: string,
  userId: string,
  context?: { contestationId?: string },
  tx?: Prisma.TransactionClient,
) {
  const run = async (client: Prisma.TransactionClient) => {
    const source = await client.bon.findUnique({
      where: { id: sourceBonId },
      include: { equipments: { orderBy: { order: 'asc' } } },
    });
    if (!source) throw new NotFoundException('Bon source introuvable');

    const reference = await generateBonReference(client);
    const bon = await client.bon.create({
      data: {
        reference,
        filialeId: source.filialeId,
        collaborateurId: source.collaborateurId,
        collaborateurEmail: source.collaborateurEmail,
        createdById: userId,
        civilite: source.civilite,
        dateMiseDisposition: source.dateMiseDisposition,
        dateRestitution: source.dateRestitution,
        notes: source.notes,
        equipments: {
          create: source.equipments.map((e, idx) => ({
            catalogItemId: e.catalogItemId,
            customLabel: e.customLabel,
            serialNumber: e.serialNumber,
            inventoryNumber: e.inventoryNumber,
            notes: e.notes,
            order: e.order ?? idx,
          })),
        },
      },
      ...BON_SELECT,
    });

    await client.auditLog.create({
      data: {
        bonId: bon.id,
        userId,
        action: 'bon_created',
        details: { correctedFrom: source.reference, sourceBonId, ...context },
      },
    });
    await client.auditLog.create({
      data: {
        bonId: sourceBonId,
        userId,
        action: 'bon_corrected',
        details: { correctedTo: bon.reference, newBonId: bon.id, ...context },
      },
    });

    return bon;
  };

  return tx ? run(tx) : ctx.prisma.$transaction(run, BON_REFERENCE_TX_OPTIONS);
}
