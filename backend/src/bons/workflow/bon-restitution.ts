import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { assertCanSendLink } from '../../common/can-send-link';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed, statusChangedMeanwhile } from './bon-guards';
import { invalidateItSignatures, invalidatePendingLinks } from './bon-links';
import { emitPvClotureIfDue } from './bon-cloture';
import { ClientTrace, saveItSignatureWithTrace } from './bon-it-signature';
import { computeBonFacts, equipmentReturnState, lastSignedRestitutionAt } from './bon-facts';
import { pendingDocument, statusAfterReturnChange } from './state-machine';

/**
 * Restitution : marquage des équipements rendus, annulation d'un marquage,
 * déclaration de non-restitution.
 *
 * Ordre imposé, par email comme au guichet (R-010) : 1) marquer les
 * équipements rendus (ce module) ; 2) signature IT de la restitution, dont le
 * PDF montre donc les équipements rendus ; 3) le lien (renvoi par email, ou
 * lien au guichet). Rien ne part avant la signature IT.
 */

/**
 * Recalcule le statut depuis les équipements et l'écrit (transition
 * conditionnelle sur le statut lu). L'horloge de la demande (`awaitingSince`)
 * repart quand c'est une nouvelle demande de signature (`newRequest`) ou que
 * le document attendu change ; elle s'arrête quand plus rien n'attend.
 */
export async function applyReturnChange(tx: Prisma.TransactionClient, id: string, newRequest: boolean): Promise<void> {
  const bon = await findBonDetailOrThrow(tx, id);
  const facts = computeBonFacts(bon);
  const status = statusAfterReturnChange(facts);
  const before = pendingDocument(facts);
  const after = pendingDocument({ ...facts, status });
  const awaitingSince = after === null ? null : newRequest || after !== before ? new Date() : bon.awaitingSince ?? new Date();
  const transition = await tx.bon.updateMany({ where: { id, status: bon.status }, data: { status, awaitingSince } });
  if (transition.count === 0) throw statusChangedMeanwhile();
}

/**
 * Marque les équipements rendus (sélection). `inPerson` : restitution au
 * guichet ; sinon le lien partira par email, ce que `canSendLink` doit
 * permettre AVANT tout marquage (R-004, R-009).
 */
export async function initiateRestitution(
  ctx: BonsWorkflowContext,
  id: string,
  actorId: string | null,
  returnedEquipmentIds: readonly string[] | undefined,
  inPerson = false,
): Promise<void> {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'restitution_in_person');
  if (!inPerson) assertCanSendLink(bon.collaborateur);
  const ids = [...new Set(returnedEquipmentIds ?? [])];
  if (ids.length === 0) throw new BadRequestException('Sélectionnez au moins un équipement rendu.');

  await ctx.prisma.$transaction(async (tx) => {
    const marked = await tx.bonEquipment.updateMany({
      where: { id: { in: ids }, bonId: id, returnedAt: null, notReturned: false },
      data: { returnedAt: new Date() },
    });
    if (marked.count !== ids.length) {
      throw new BadRequestException(
        'Certains équipements sélectionnés ne sont pas chez le collaborateur (déjà rendus, déclarés non restitués ou d’un autre bon).',
      );
    }
    // Le document de restitution change : l'ancien lien ne vaut plus.
    await invalidatePendingLinks(tx, id, 'replaced');
    await applyReturnChange(tx, id, true);
  });
  await ctx.prisma.auditLog.create({
    data: { bonId: id, userId: actorId, action: 'restitution_initiated', details: { equipmentIds: ids, inPerson } },
  });
}

/**
 * Annule le marquage « rendu » d'équipements dont la restitution n'est pas
 * encore signée (erreur de saisie, R-011) : ils redeviennent « chez le
 * collaborateur ». Le lien de restitution et la signature IT de restitution
 * ne valent plus (motif « bon modifié ») ; s'il reste des équipements rendus
 * à signer, une nouvelle signature IT puis un nouveau lien suivront.
 */
export async function undoReturn(
  ctx: BonsWorkflowContext,
  id: string,
  actorId: string,
  equipmentIds: readonly string[],
): Promise<void> {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'undo_return');
  const ids = [...new Set(equipmentIds)];
  const signedAt = lastSignedRestitutionAt(bon.signatures);
  const undoable = new Set(
    bon.equipments.filter((e) => equipmentReturnState(e, signedAt, bon.status) === 'returned_to_sign').map((e) => e.id),
  );
  if (ids.length === 0 || ids.some((eid) => !undoable.has(eid))) {
    throw new BadRequestException(
      'Seuls des équipements marqués rendus, dont la restitution n’est pas encore signée, peuvent être remis chez le collaborateur.',
    );
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.bonEquipment.updateMany({ where: { id: { in: ids }, bonId: id }, data: { returnedAt: null } });
    await invalidatePendingLinks(tx, id, 'modified', ['restitution']);
    await invalidateItSignatures(tx, id, 'restitution', 'modified', signedAt);
    await applyReturnChange(tx, id, true);
  });
  await ctx.prisma.auditLog.create({
    data: { bonId: id, userId: actorId, action: 'return_marking_undone', details: { equipmentIds: ids } },
  });
}

/**
 * Déclare des équipements non restitués (motif, signature IT du futur PV).
 * Une restitution en attente de signature n'est pas touchée : son lien reste
 * valable, et le PV suivra sa signature. Quand plus rien n'est chez le
 * collaborateur ni à signer, le PV est émis tout de suite.
 */
export async function declareNotReturned(
  ctx: BonsWorkflowContext,
  id: string,
  equipmentIds: readonly string[],
  reason: string,
  actorId: string,
  signatureDataUrl?: string,
  client?: ClientTrace,
): Promise<void> {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'declare_not_returned');
  const ids = [...new Set(equipmentIds)];
  if (ids.length === 0) throw new BadRequestException('Aucun équipement sélectionné.');
  // Image validée AVANT toute écriture : pas d'état partiel si elle est illisible.
  if (signatureDataUrl) assertPngDataUrl(signatureDataUrl);

  await ctx.prisma.$transaction(async (tx) => {
    const marked = await tx.bonEquipment.updateMany({
      where: { id: { in: ids }, bonId: id, returnedAt: null, notReturned: false },
      data: { notReturned: true, notReturnedReason: reason },
    });
    if (marked.count !== ids.length) {
      throw new BadRequestException(
        'Certains équipements sélectionnés ne sont pas chez le collaborateur (déjà rendus ou déjà déclarés).',
      );
    }
    await tx.auditLog.create({
      data: { bonId: id, userId: actorId, action: 'declare_not_returned', details: { equipmentIds: ids, reason } },
    });
    await applyReturnChange(tx, id, false);
  });

  const emitted = await emitPvClotureIfDue(ctx, id, signatureDataUrl, actorId, { client });
  if (!emitted && signatureDataUrl) {
    // PV pas encore dû (équipements encore dehors, ou restitution à signer) :
    // la signature IT est gardée pour lui, elle ne doit pas se perdre.
    await saveItSignatureWithTrace(ctx, id, signatureDataUrl, actorId, client);
  }
}
