import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { isRecipient } from './recipient';
import { isReplacedToken } from './token';
import { effectiveInvalidationReason } from './link-invalidation';
import { lastLinkRequestAt } from './link-request';

export interface BonInfoDeps {
  prisma: PrismaService;
}

/**
 * État d'un lien de signature, pour la page de signature. Le bon complet
 * n'est renvoyé qu'au destinataire (ou pour un lien au guichet), et seulement
 * tant que le lien attend sa signature ; sinon une réponse minimale qui dit
 * pourquoi le lien ne sert plus (motif réel d'une invalidation, R-038).
 */
export async function getBonInfoByToken(
  deps: BonInfoDeps,
  token: string,
  requesterEmail?: string,
  requesterId?: string,
) {
  const sig = await deps.prisma.signature.findUnique({
    where: { token },
    include: {
      bon: { select: BON_FOR_SIGNATURE_SELECT },
    },
  });

  if (!sig) throw new NotFoundException('Lien de signature invalide');

  // Contrôle destinataire AVANT toute donnée : un non-destinataire ne doit
  // pas pouvoir confirmer l'existence d'un bon ni récupérer sa référence,
  // même pour un lien expiré ou déjà signé (fail-closed, hors présentiel).
  if (!isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId)) {
    return { status: 'unauthorized' };
  }

  // Bon annulé/contesté : à traiter AVANT signed/expired pour que la page
  // affiche l'écran dédié plutôt qu'un simple « lien expiré / déjà signé ».
  if (sig.bon.status === 'cancelled' || sig.bon.status === 'contested') {
    return { status: sig.bon.status as 'cancelled' | 'contested', reference: sig.bon.reference };
  }

  if (sig.signed) {
    return { status: 'already_signed', reference: sig.bon.reference, bonId: sig.bon.id };
  }

  if (isReplacedToken(sig.tokenExpiresAt)) {
    return {
      status: 'replaced',
      reference: sig.bon.reference,
      invalidatedReason: effectiveInvalidationReason(sig.invalidatedReason, sig.bon.status),
    };
  }
  if (new Date() > sig.tokenExpiresAt) {
    const requestedAt = await lastLinkRequestAt(deps.prisma, sig.bon.id, sig.createdAt);
    return { status: 'expired', reference: sig.bon.reference, newLinkRequestedAt: requestedAt };
  }

  return {
    status: 'pending',
    bon: sanitizeBonForResponse(sig.bon),
    signature: toSafeSignature(sig as unknown as Record<string, unknown>),
  };
}
