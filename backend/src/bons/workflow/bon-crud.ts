import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateBonDto, UpdateBonDto } from '../dto/bon.dto';
import { Civilite } from '../../common/types';
import { generateBonReference, BON_REFERENCE_TX_OPTIONS } from '../../common/bon-reference';
import { BON_SELECT, findBonOrThrow } from '../queries/bon-where';
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
        equipments: { create: equipments },
      },
      ...BON_SELECT,
    });
  }, BON_REFERENCE_TX_OPTIONS);
  await prisma.auditLog.create({
    data: { bonId: bon.id, userId, action: 'bon_created' },
  });
  return bon;
}

export async function updateBon(ctx: BonsWorkflowContext, id: string, dto: UpdateBonDto) {
  const { prisma } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  if (bon.status !== 'draft')
    throw new BadRequestException(
      'Seuls les brouillons peuvent être modifiés',
    );

  const effectiveMiseDispo =
    dto.dateMiseDisposition ?? new Date(bon.dateMiseDisposition).toISOString().slice(0, 10);
  const effectiveRestitution =
    dto.dateRestitution !== undefined
      ? dto.dateRestitution
      : bon.dateRestitution
        ? new Date(bon.dateRestitution).toISOString().slice(0, 10)
        : null;
  if (effectiveRestitution && effectiveRestitution < effectiveMiseDispo) {
    throw new BadRequestException(
      'La date de restitution ne peut pas précéder la date de mise à disposition',
    );
  }

  const data: Prisma.BonUncheckedUpdateInput = {};
  if (dto.filialeId) {
    await assertFilialeUsable(prisma, dto.filialeId);
    data.filialeId = dto.filialeId;
  }
  if (dto.collaborateurId) {
    const collab = await prisma.user.findUnique({
      where: { id: dto.collaborateurId },
    });
    if (!collab) throw new NotFoundException('Collaborateur introuvable');
    if (!collab.active) throw new BadRequestException('Le collaborateur est désactivé');
    data.collaborateurId = dto.collaborateurId;
    data.collaborateurEmail = collab.email;
  }
  if (dto.civilite) data.civilite = dto.civilite as Civilite;
  if (dto.dateMiseDisposition)
    data.dateMiseDisposition = new Date(dto.dateMiseDisposition);
  if (dto.dateRestitution !== undefined)
    data.dateRestitution = dto.dateRestitution
      ? new Date(dto.dateRestitution)
      : null;
  if (dto.notes !== undefined) {
    // '' efface la note (persistée comme null) ; undefined = inchangé (cf. ci-dessus).
    data.notes = dto.notes.trim() === '' ? null : dto.notes;
  }

  if (dto.equipments !== undefined) {
    const normalizedEquipments = dto.equipments.map((e, idx) => normalizeEquipmentInput(e, idx));
    const catalogIds = normalizedEquipments.map((e) => e.catalogItemId).filter((cid): cid is string => !!cid);
    await assertCatalogItemsUsable(prisma, catalogIds);
    assertNoDuplicateSerials(normalizedEquipments);
    data.equipments = { create: normalizedEquipments };
  }

  // Atomicité : (1) claim conditionnel du statut DANS la transaction (comme
  // partout ailleurs dans ce module) — un send() concurrent entre le
  // findBonOrThrow ci-dessus et l'écriture perd alors la course au lieu de
  // voir un bon déjà envoyé silencieusement réécrit ; (2) delete + recreate
  // des équipements rollbackés ensemble si l'update échoue (FK invalide, erreur DB).
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.bon.updateMany({ where: { id, status: 'draft' }, data: {} });
    if (claimed.count === 0) {
      throw new ConflictException('Ce bon n\'est plus un brouillon — il a été envoyé entre-temps');
    }
    if (dto.equipments !== undefined) {
      await tx.bonEquipment.deleteMany({ where: { bonId: id } });
    }
    return tx.bon.update({ where: { id }, data, ...BON_SELECT });
  });
}

export async function cancelBon(ctx: BonsWorkflowContext, id: string, userId?: string) {
  const { prisma, signatureService, notificationService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  // Seuls les brouillons et les bons en attente de signature mise-à-disposition
  // peuvent être annulés. Dès qu'une signature a eu lieu (statut active ou
  // ultérieur), l'annulation est bloquée au profit de la restitution ou de
  // la clôture unilatérale.
  if (!['draft', 'sent_mise_dispo'].includes(bon.status)) {
    throw new BadRequestException('Ce bon ne peut plus être annulé une fois signé');
  }

  // Transition conditionnelle D'ABORD : si une signature s'est committée
  // entre le findBonOrThrow et ici (course), elle a fait avancer le statut
  // hors de {draft, sent_mise_dispo} — on ne l'écrase pas avec 'cancelled'.
  const transition = await prisma.bon.updateMany({
    where: { id, status: { in: ['draft', 'sent_mise_dispo'] } },
    data: { status: 'cancelled' },
  });
  if (transition.count === 0) {
    throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
  }
  // Invalidation ENSUITE, seulement si la transition a gagné la course
  // (cohérent avec closeUnilaterally).
  await signatureService.invalidateUnsignedTokens(id);

  const updated = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
  await prisma.auditLog.create({
    data: { bonId: id, userId: userId ?? null, action: 'bon_cancelled' },
  });
  // Notify the collaborator if a signature request had already been sent
  if (bon.status === 'sent_mise_dispo') {
    notificationService.sendCancellationNotice(updated).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
  }
  return updated;
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
