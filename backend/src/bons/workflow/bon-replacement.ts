import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BON_REFERENCE_TX_OPTIONS, generateBonReference } from '../../common/bon-reference';
import { DOMAIN_EVENTS } from '../../common/events';
import { BonStatusList, isBonStatusIn } from '../bon-status';
import { BonsWorkflowContext } from './bon-context';

/**
 * Remplacement d'un bon après une contestation « Fondée » (décision du 24/09,
 * R-050) : la correction se fait sur un NOUVEAU bon, lié à l'original
 * (`replacesBonId`).
 *
 *  1. `createReplacementBon` crée le remplaçant en brouillon, contenu repris
 *     de l'original (collaborateur, filiale, dates, équipements, remarques),
 *     pour que l'IT le corrige puis l'envoie par le parcours habituel
 *     (signature IT, puis lien ou guichet). L'original reste « En cours » :
 *     le matériel est toujours chez le collaborateur, dans l'inventaire et
 *     dans son portail.
 *  2. Quand le collaborateur signe la remise du remplaçant (événement
 *     `signature.signed`), `closeReplacedOriginal` clôture l'original,
 *     « remplacé par » le nouveau, et publie `bon.replaced`.
 */

/** Un bon clos, un brouillon ou un bon annulé ne se remplace pas. */
const NOT_REPLACEABLE: BonStatusList = Object.freeze(['draft', 'cancelled', 'archived']);

export interface ReplacementRequest {
  readonly originalBonId: string;
  readonly actorId: string;
  /** Contestation Fondée à l'origine du remplacement, tracée dans l'audit. */
  readonly contestationId?: string | null;
}

/** Crée le bon remplaçant (brouillon lié à l'original). Accepte la
 *  transaction de l'appelant (décision sur la contestation). */
export async function createReplacementBon(
  ctx: BonsWorkflowContext,
  request: ReplacementRequest,
  tx?: Prisma.TransactionClient,
): Promise<{ id: string; reference: string }> {
  const run = async (client: Prisma.TransactionClient) => {
    const original = await client.bon.findUnique({
      where: { id: request.originalBonId },
      include: { equipments: { orderBy: { order: 'asc' } }, replacedBy: { select: { id: true } }, collaborateur: true },
    });
    if (!original) throw new NotFoundException('Bon à remplacer introuvable');
    if (isBonStatusIn(original.status, NOT_REPLACEABLE)) {
      throw new BadRequestException('Seul un bon remis au collaborateur peut être remplacé.');
    }
    if (original.replacedBy) throw new ConflictException('Ce bon a déjà un bon remplaçant.');

    const replacement = await client.bon.create({
      data: {
        reference: await generateBonReference(client),
        filialeId: original.filialeId,
        collaborateurId: original.collaborateurId,
        collaborateurEmail: original.collaborateur.email,
        createdById: request.actorId,
        civilite: original.collaborateur.civilite ?? original.civilite,
        dateMiseDisposition: original.dateMiseDisposition,
        dateRestitution: original.dateRestitution,
        notes: original.notes,
        internalNote: original.internalNote,
        replacesBonId: original.id,
        equipments: {
          create: original.equipments.map((e, idx) => ({
            catalogItemId: e.catalogItemId,
            customLabel: e.customLabel,
            serialNumber: e.serialNumber,
            inventoryNumber: e.inventoryNumber,
            notes: e.notes,
            order: e.order ?? idx,
          })),
        },
      },
      select: { id: true, reference: true },
    });
    const context = { contestationId: request.contestationId ?? null };
    await client.auditLog.create({
      data: {
        bonId: replacement.id,
        userId: request.actorId,
        action: 'bon_created',
        details: { replacesBonId: original.id, replaces: original.reference, ...context },
      },
    });
    await client.auditLog.create({
      data: {
        bonId: original.id,
        userId: request.actorId,
        action: 'bon_corrected',
        details: { correctedTo: replacement.reference, newBonId: replacement.id, ...context },
      },
    });
    return replacement;
  };
  return tx ? run(tx) : ctx.prisma.$transaction(run, BON_REFERENCE_TX_OPTIONS);
}

/**
 * La remise du remplaçant vient d'être signée : l'original passe « Clôturé »,
 * remplacé (sa relation `replacedBy` le dit), ses liens encore en attente
 * sont invalidés. Sans effet pour un bon qui ne remplace rien, ou dont
 * l'original est déjà clos (rejeu de l'événement).
 */
export async function closeReplacedOriginal(ctx: BonsWorkflowContext, replacementBonId: string): Promise<void> {
  const replacement = await ctx.prisma.bon.findUnique({
    where: { id: replacementBonId },
    select: { id: true, reference: true, replacesBon: { select: { id: true, reference: true } } },
  });
  const original = replacement?.replacesBon;
  if (!replacement || !original) return;
  const now = new Date();
  const closed = await ctx.prisma.$transaction(async (tx) => {
    const transition = await tx.bon.updateMany({
      where: { id: original.id, status: { notIn: ['archived', 'cancelled'] } },
      data: { status: 'archived', archivedAt: now, awaitingSince: null },
    });
    if (transition.count === 0) return false;
    await tx.signature.updateMany({
      where: { bonId: original.id, signed: false, type: { not: 'it_cachet' }, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: 'replaced' },
    });
    await tx.auditLog.create({
      data: {
        bonId: original.id,
        action: 'bon_replaced',
        details: { replacementBonId: replacement.id, replacement: replacement.reference },
      },
    });
    return true;
  });
  if (!closed) return;
  const contestation = await ctx.prisma.contestation.findFirst({
    where: { bonId: original.id, outcome: 'founded' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  await ctx.events.publish(DOMAIN_EVENTS.bonReplaced, {
    bonId: original.id,
    bonReference: original.reference,
    actorId: null,
    occurredAt: now,
    replacementBonId: replacement.id,
    replacementBonReference: replacement.reference,
    contestationId: contestation?.id ?? null,
  });
}
