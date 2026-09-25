import { BadRequestException, ConflictException } from '@nestjs/common';
import { BonStatus } from '../../common/types';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { isDeliverableEmail, undeliverableEmailMessage } from '../../common/email';
import { BON_SELECT, findBonOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext, assertNoPendingRestitutionSignature } from './bon-context';
import { emitPvClotureIfDue } from './bon-cloture';
import { LOANED_BON_STATUSES, RESTITUTION_START_BON_STATUSES, isBonStatusIn } from '../bon-status';

export async function initiateRestitution(
  ctx: BonsWorkflowContext,
  id: string,
  initiatedById?: string,
  returnedEquipmentIds?: string[],
) {
  const { prisma, signatureService, notificationService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  if (!isBonStatusIn(bon.status, RESTITUTION_START_BON_STATUSES))
    throw new BadRequestException(
      'La restitution ne peut être initiée que sur un bon actif ou partiellement restitué',
    );

  if (!returnedEquipmentIds?.length) {
    throw new BadRequestException('Sélectionnez au moins un équipement à restituer');
  }
  // Même exigence qu'à l'envoi (bon-send.ts) : cette voie envoie un lien de
  // signature par email. Sans adresse délivrable, le bon basculerait en
  // attente d'une signature que personne ne peut demander — impasse
  // silencieuse. Le présentiel (initiateInPersonSignature) n'exige aucune
  // adresse : c'est ce que propose le message.
  if (!isDeliverableEmail(bon.collaborateurEmail)) {
    throw new BadRequestException(undeliverableEmailMessage(bon.collaborateurEmail));
  }
  const ids = [...new Set(returnedEquipmentIds)];

  // Marquage des équipements + calcul du nouveau statut + transition
  // conditionnelle dans LA MÊME transaction : une annulation/contestation
  // concurrente entre le findBonOrThrow ci-dessus et l'écriture ne doit pas
  // être écrasée par une transition calculée sur un statut périmé.
  await prisma.$transaction(async (tx) => {
    const marked = await tx.bonEquipment.updateMany({
      where: {
        id: { in: ids },
        bonId: id,
        returnedAt: null,
        notReturned: false,
      },
      data: { returnedAt: new Date() },
    });
    if (marked.count !== ids.length) {
      // Message spécifique quand la sélection ne contient QUE des
      // équipements déjà déclarés non rendus : le blocage n'est pas une
      // erreur de sélection mais l'attente de co-signature du PV en cours.
      const allDeclaredNotReturned = await tx.bonEquipment.count({
        where: { id: { in: ids }, bonId: id, notReturned: true },
      });
      if (allDeclaredNotReturned === ids.length) {
        throw new BadRequestException(
          'Tous les équipements restants sont déclarés non rendus : le PV de clôture est en attente de co-signature',
        );
      }
      throw new BadRequestException(
        "Certains équipements n'appartiennent pas à ce bon ou sont déjà restitués",
      );
    }

    // Pending = neither returned nor declared lost. Lost equipment (notReturned)
    // is NOT "returned": it must go through the co-signed PV de clôture flow.
    const [remaining, notReturnedCount] = await Promise.all([
      tx.bonEquipment.count({
        where: { bonId: id, returnedAt: null, notReturned: false },
      }),
      tx.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
    ]);

    const fullyReturned = remaining === 0 && notReturnedCount === 0;
    const txNewStatus: BonStatus = fullyReturned ? 'sent_restitution' : 'partially_returned';

    const transition = await tx.bon.updateMany({
      where: { id, status: { in: [...RESTITUTION_START_BON_STATUSES] } },
      data: { status: txNewStatus },
    });
    if (transition.count === 0) {
      throw new ConflictException('Le statut du bon a changé, rechargez la page');
    }

    return { newStatus: txNewStatus };
  });

  const updated = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

  // Invalidate any token from a previous flow (e.g. a stale pv_cloture link)
  // before issuing the restitution token
  await signatureService.invalidateUnsignedTokens(id);

  // Generate signature token for restitution (even partial — to sign what's been returned)
  const sig = await signatureService.generateToken(
    id,
    'restitution',
    initiatedById,
    false,
  );

  // Send email
  notificationService
    .sendRestitutionRequest(updated, sig.token)
    .catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));

  await prisma.auditLog.create({
    data: { bonId: id, userId: initiatedById ?? null, action: 'restitution_initiated' },
  });
  return updated;
}

export async function declareNotReturned(
  ctx: BonsWorkflowContext,
  id: string,
  equipmentIds: string[],
  reason: string,
  userId: string,
  signatureDataUrl?: string,
) {
  const { prisma, signatureService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  if (!isBonStatusIn(bon.status, LOANED_BON_STATUSES))
    throw new BadRequestException('Action impossible sur ce bon');

  if (!equipmentIds?.length) throw new BadRequestException('Aucun équipement sélectionné');
  const ids = [...new Set(equipmentIds)];

  // Valider le PNG AVANT toute écriture : sinon la transaction ci-dessous se
  // commite (équipements marqués perdus) et la signature échoue ensuite avec
  // un état partiel (pas de PV, pas de token).
  if (signatureDataUrl) {
    assertPngDataUrl(signatureDataUrl);
  }

  // Une signature de restitution en attente ne doit pas être écrasée par une
  // déclaration de non-restitution pendant qu'elle est en vol chez le
  // collaborateur (la restitution de ce qui a déjà été rendu serait perdue).
  await assertNoPendingRestitutionSignature(ctx, id);

  // Wrap equipment update + audit log + status change in a transaction
  const remaining = await prisma.$transaction(async (tx) => {
    // Mark equipments as not returned (notReturned:false dans le where :
    // une ré-déclaration d'un équipement déjà déclaré non rendu est rejetée
    // plutôt que silencieusement acceptée)
    const marked = await tx.bonEquipment.updateMany({
      where: {
        id: { in: ids },
        bonId: id,
        returnedAt: null,
        notReturned: false,
      },
      data: { notReturned: true, notReturnedReason: reason },
    });
    // Reject ids that don't belong to this bon / are already returned —
    // otherwise the state machine advances with nothing actually changed
    if (marked.count !== ids.length) {
      throw new BadRequestException(
        'Certains équipements sélectionnés n\'appartiennent pas à ce bon ou sont déjà restitués',
      );
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        bonId: id,
        userId,
        action: 'declare_not_returned',
        details: { equipmentIds: ids, reason },
      },
    });

    // Check if all equipments are now resolved (returned or not returned)
    const count = await tx.bonEquipment.count({
      where: { bonId: id, returnedAt: null, notReturned: false },
    });

    // Always update status to partially_returned while waiting for PV signature.
    // Transition conditionnelle : un cancel/contestation concurrent gagne la
    // course plutôt que d'être écrasé.
    const transition = await tx.bon.updateMany({
      where: { id, status: { in: [...LOANED_BON_STATUSES] } },
      data: { status: 'partially_returned' },
    });
    if (transition.count === 0) {
      throw new ConflictException('Le statut du bon a changé, rechargez la page');
    }

    return count;
  });

  if (remaining > 0) {
    // Des équipements restent ni rendus ni déclarés : pas encore de PV
    // complet. La signature IT est conservée immédiatement pour le futur PV
    // — sinon elle serait validée puis silencieusement perdue, et le bon se
    // bloquerait.
    if (signatureDataUrl) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      await signatureService.saveItPvSignature(id, signatureDataUrl, user?.email ?? 'unknown', userId);
    }
    await prisma.auditLog.create({
      data: {
        bonId: id,
        userId,
        action: 'declare_not_returned_partial',
        details: { remaining, message: 'Équipements restants à traiter avant émission du PV' },
      },
    });
    logger.log(`Bon ${id} — non-rendus déclarés, ${remaining} équipement(s) restant(s) à traiter avant le PV`);
  } else {
    // All resolved → generate PV with IT signature, send to collab for
    // co-signature. Pas d'invalidateUnsignedTokens ici (hors verrou) : un
    // appel préalable pourrait, en cas de course, invalider le token
    // pv_cloture déjà committé par une requête concurrente juste avant que
    // son propre contrôle d'idempotence ne le voie — emitPvClotureIfDue
    // invalide déjà les tokens d'un autre type DANS son verrou advisory.
    const emitted = await emitPvClotureIfDue(ctx, id, signatureDataUrl, userId);
    if (!emitted) {
      logger.warn(
        `Bon ${id} — PV clôture non émis après declareNotReturned (conditions non réunies ou déjà en attente)`,
      );
    }
  }

  return findBonOrThrow(prisma, id);
}

