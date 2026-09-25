import { BadRequestException, ConflictException } from '@nestjs/common';
import { BonStatus } from '../../common/types';
import { isDeliverableEmail, undeliverableEmailMessage } from '../../common/email';
import { BON_SELECT, findBonOrThrow } from '../queries/bon-where';
import { assertSendable } from '../validation/bon-validators';
import { findSerialConflicts } from '../../equipment/equipment-serial';
import { BonsWorkflowContext } from './bon-context';

export async function sendBon(
  ctx: BonsWorkflowContext,
  id: string,
  initiatedById?: string,
  confirmSerialConflicts = false,
) {
  const { prisma, signatureService, notificationService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  if (bon.status !== 'draft')
    throw new BadRequestException('Seuls les brouillons peuvent être envoyés');
  await assertSendable(prisma, bon);
  // L'envoi par email exige une adresse délivrable (le présentiel, non).
  if (!isDeliverableEmail(bon.collaborateurEmail)) {
    throw new BadRequestException(undeliverableEmailMessage(bon.collaborateurEmail));
  }

  const serials = bon.equipments.map((e) => e.serialNumber).filter((s): s is string => !!s);
  // Même vérification que l'écran de saisie. La réponse 409 et l'audit ne
  // gardent que le numéro et la référence du bon où il circule déjà.
  const { items } = await findSerialConflicts(prisma, serials, id);
  const serialConflicts = items.map(({ serialNumber, bonReference }) => ({ serialNumber, bonReference }));
  if (serialConflicts.length > 0 && !confirmSerialConflicts) {
    throw new ConflictException({ code: 'serial_conflicts', conflicts: serialConflicts });
  }

  // Conditional transition: a concurrent send loses the race instead of
  // re-running the whole flow (duplicate tokens + duplicate emails)
  const transition = await prisma.bon.updateMany({
    where: { id, status: 'draft' },
    data: { status: 'sent_mise_dispo' },
  });
  if (transition.count === 0) {
    throw new ConflictException('Ce bon a déjà été envoyé');
  }
  const updated = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

  // Generate signature token
  const sig = await signatureService.generateToken(
    id,
    'mise_disposition',
    initiatedById,
    false,
  );

  // Send email (fire and forget — ne pas bloquer si SMTP non configuré)
  notificationService
    .sendMiseDispositionRequest(updated, sig.token)
    .catch((err: unknown) => logger.error(`Email send (${id}): ${err}`));

  await prisma.auditLog.create({
    data: { bonId: id, userId: initiatedById ?? null, action: 'bon_sent' },
  });
  if (serialConflicts.length > 0 && confirmSerialConflicts) {
    await prisma.auditLog.create({
      data: {
        bonId: id,
        userId: initiatedById ?? null,
        action: 'bon_sent_with_serial_conflicts',
        details: { conflicts: serialConflicts },
      },
    });
  }
  return updated;
}

export async function initiateInPersonSignature(
  ctx: BonsWorkflowContext,
  id: string,
  type: 'mise_disposition' | 'restitution',
  initiatedById: string,
) {
  const { prisma, signatureService } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  // Les statuts sent_* sont autorisés pour permettre de RÉAFFICHER le lien
  // présentiel (modale fermée par erreur) : la ré-initiation invalide
  // l'ancien token et en génère un nouveau — rien n'est dupliqué.
  const allowedStatuses: Record<string, string[]> = {
    mise_disposition: ['draft', 'sent_mise_dispo'],
    restitution: ['active', 'partially_returned', 'sent_restitution'],
  };

  if (!allowedStatuses[type]?.includes(bon.status)) {
    throw new BadRequestException(
      `Impossible d'initier une signature présentielle pour un bon en statut "${bon.status}"`,
    );
  }

  if (type === 'mise_disposition') {
    await assertSendable(prisma, bon);
  }

  if (type === 'restitution') {
    // Un PV d'équipements non restitués dû (ou déjà émis, en attente de
    // co-signature) court-circuite la restitution présentielle : les
    // équipements non rendus doivent d'abord être traités via le PV.
    const [pending, notReturnedCount, pendingPv] = await Promise.all([
      prisma.bonEquipment.count({ where: { bonId: id, returnedAt: null, notReturned: false } }),
      prisma.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
      prisma.signature.findFirst({
        where: { bonId: id, type: 'pv_cloture', signed: false, tokenExpiresAt: { gt: new Date() } },
      }),
    ]);
    const pvDue = pending === 0 && notReturnedCount > 0;
    if (pvDue || pendingPv) {
      throw new BadRequestException(
        "Un procès-verbal d'équipements non restitués est en attente : la restitution présentielle n'est pas possible",
      );
    }
  }

  const newStatus: BonStatus = type === 'mise_disposition' ? 'sent_mise_dispo' : 'sent_restitution';
  // Ré-affichage du lien (le bon est DÉJÀ dans le statut cible) : on régénère
  // uniquement le token. On évite alors le bon.update — sinon @updatedAt
  // repositionne l'horloge à « maintenant », ce qui repousserait indéfiniment
  // les rappels et le calcul de retard (qui se basent sur updatedAt).
  const isReinit = bon.status === newStatus;

  let updated = bon;
  if (!isReinit) {
    // Marquage des équipements + transition conditionnelle dans LA MÊME
    // transaction (comme initiateRestitution) : si la transition perd la
    // course (changement de statut concurrent — annulation, contestation…),
    // le marquage des équipements ci-dessus est rollbacké avec elle, au
    // lieu de rester appliqué sur un bon dont le statut n'a pas bougé.
    await prisma.$transaction(async (tx) => {
      // Pour la restitution en présentiel, marquer tous les équipements non
      // encore traités comme rendus (uniquement lors de la vraie initiation)
      if (type === 'restitution') {
        await tx.bonEquipment.updateMany({
          where: { bonId: id, returnedAt: null, notReturned: false },
          data: { returnedAt: new Date() },
        });
      }
      const transition = await tx.bon.updateMany({
        where: { id, status: bon.status as BonStatus },
        data: { status: newStatus },
      });
      if (transition.count === 0) {
        throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
      }
    });
    updated = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

    if (bon.status === 'draft') {
      await prisma.auditLog.create({
        data: { bonId: id, userId: initiatedById, action: 'bon_sent', details: { inPerson: true } },
      });
    }
  }

  // Ré-affichage : renvoyer le token présentiel déjà en attente (même type,
  // non signé, non expiré) plutôt que d'en générer un nouveau à chaque
  // ouverture de la modale.
  let sig: { token: string } | null = isReinit
    ? await prisma.signature.findFirst({
        where: { bonId: id, type, isInPerson: true, signed: false, tokenExpiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  if (!sig) {
    // Invalide tous les tokens en attente, quel que soit leur type, avant
    // d'en émettre un nouveau (generateToken n'invalide que ceux du même type).
    await signatureService.invalidateUnsignedTokens(id);
    sig = await signatureService.generateToken(id, type, initiatedById, true);
  }

  return { bon: updated, token: sig.token };
}
