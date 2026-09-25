import { BadRequestException, ConflictException } from '@nestjs/common';
import { isDeliverableEmail, undeliverableEmailMessage } from '../../common/email';
import { findBonOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { emitPvClotureIfDue } from './bon-cloture';
import { RESTITUTION_PHASE_BON_STATUSES, SIGNATURE_LINK_BON_STATUSES, isBonStatusIn } from '../bon-status';

/**
 * Renvoi manuel du lien de signature (depuis BonDetail par l'IT).
 * Génère un nouveau token et renvoie l'email correspondant.
 */
export async function resendSignatureLink(ctx: BonsWorkflowContext, bonId: string, initiatedById: string, force = false) {
  const { prisma, signatureService, notificationService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, bonId);

  if (!isBonStatusIn(bon.status, SIGNATURE_LINK_BON_STATUSES))
    throw new BadRequestException(
      'Le renvoi est possible uniquement pour les bons en attente de signature',
    );
  if (!isDeliverableEmail(bon.collaborateurEmail)) {
    throw new BadRequestException(undeliverableEmailMessage(bon.collaborateurEmail));
  }

  // Guard: if a valid token was sent less than 1 hour ago, require explicit confirmation
  if (!force) {
    const recentSig = await prisma.signature.findFirst({
      where: {
        bonId,
        signed: false,
        tokenExpiresAt: { gt: new Date(1000) }, // exclude invalidated tokens (epoch)
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentSig) {
      throw new ConflictException({
        code: 'token_recent',
        sentAt: recentSig.createdAt.toISOString(),
      });
    }
  }

  // PV pending is determined from the BUSINESS state, not the token validity:
  // an expired pv_cloture link must be re-sent as a PV, not as a restitution
  // (which would leave the PV unsigned and the bon stuck in partially_returned).
  // Le critère hasUnsignedPv est supprimé : une ligne Signature pv_cloture non
  // signée peut être purgée par retention.service (tokens expirés), ce qui
  // ferait alors passer un PV réellement en attente pour "pas de PV en cours".
  const notReturnedCount = bon.equipments.filter((e) => e.notReturned).length;
  const pendingReturnCount = bon.equipments.filter((e) => !e.returnedAt && !e.notReturned).length;
  const isPvClotureDue = bon.status === 'partially_returned' && pendingReturnCount === 0 && notReturnedCount > 0;
  const isPendingRestitution = bon.status === 'partially_returned' && pendingReturnCount > 0;

  if (isPvClotureDue) {
    // Si aucun PV n'a jamais été généré pour ce bon, emitPvClotureIfDue fait
    // tout (signature IT existante réutilisée, PDF, token, email) — sinon on
    // se contente de renvoyer un nouveau token pour le PV déjà émis.
    const everGenerated = await prisma.signature.findFirst({ where: { bonId, type: 'pv_cloture' } });
    if (!everGenerated) {
      // Pas d'invalidateUnsignedTokens ici (hors verrou) : emitPvClotureIfDue
      // invalide déjà les tokens d'un autre type DANS son verrou advisory —
      // un appel préalable pourrait, en cas de course, invalider le token
      // pv_cloture déjà committé par une requête concurrente juste avant que
      // son propre contrôle d'idempotence ne le voie.
      const emitted = await emitPvClotureIfDue(ctx, bonId, undefined, initiatedById);
      if (!emitted) {
        throw new BadRequestException('Impossible de générer le procès-verbal de clôture pour ce bon');
      }
    } else {
      await signatureService.invalidateUnsignedTokens(bonId);
      const sig = await signatureService.generateToken(bonId, 'pv_cloture', initiatedById, false);
      notificationService.sendPvClotureRequest(bon, sig.token).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
    }
  } else if (isPendingRestitution) {
    // Renvoyer le lien de restitution suppose qu'il en existe déjà un
    // (même expiré, mais pas invalidé à epoch) — sinon rien n'est en attente
    // de signature côté collaborateur pour ce bon.
    const pendingRestitutionSig = await prisma.signature.findFirst({
      where: { bonId, type: 'restitution', signed: false, tokenExpiresAt: { gt: new Date(1000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pendingRestitutionSig) {
      throw new BadRequestException('Aucune signature en attente pour ce bon');
    }
    await signatureService.invalidateUnsignedTokens(bonId);
    const sig = await signatureService.generateToken(bonId, 'restitution', initiatedById, false);
    notificationService.sendRestitutionRequest(bon, sig.token).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
  } else {
    const type: 'mise_disposition' | 'restitution' =
      isBonStatusIn(bon.status, RESTITUTION_PHASE_BON_STATUSES) ? 'restitution' : 'mise_disposition';

    // Invalider le token précédent et en générer un nouveau
    await signatureService.invalidateUnsignedTokens(bonId);
    const sig = await signatureService.generateToken(bonId, type, initiatedById, false);

    // Renvoyer l'email
    if (type === 'restitution') {
      notificationService
        .sendRestitutionRequest(bon, sig.token)
        .catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
    } else {
      notificationService
        .sendMiseDispositionRequest(bon, sig.token)
        .catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
    }
  }

  // Log d'audit
  await prisma.auditLog.create({
    data: {
      bonId,
      userId: initiatedById,
      action: 'reminder_sent',
      details: { manual: true },
    },
  });

  return { ok: true, message: 'Lien renvoyé avec succès' };
}
