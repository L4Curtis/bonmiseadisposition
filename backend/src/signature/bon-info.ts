import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { isRecipient } from './recipient';
import { isReplacedToken } from './token';

export interface BonInfoDeps {
  prisma: PrismaService;
}

/**
 * Authenticated endpoint: get bon info from token. Returns the full bon
 * payload ONLY to the intended signer (or for in-person signatures) and only
 * while the link is still pending — expired/signed links and other
 * authenticated users get a minimal status response.
 *
 * Extrait de SignatureService.getBonInfoByToken sans changement de comportement.
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
  // Comparaison par id EN PLUS de l'email : un changement d'adresse AD ne
  // doit pas priver le titulaire de son lien de signature.
  if (!isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId)) {
    return { status: 'unauthorized' };
  }

  // Bon annulé/contesté : à traiter AVANT signed/expired pour que le frontend
  // affiche l'écran dédié plutôt qu'un simple "lien expiré/déjà signé".
  if (sig.bon.status === 'cancelled' || sig.bon.status === 'contested') {
    return { status: sig.bon.status as 'cancelled' | 'contested', reference: sig.bon.reference };
  }

  if (sig.signed) {
    return { status: 'already_signed', reference: sig.bon.reference, bonId: sig.bon.id };
  }

  // Token invalidé volontairement (relance, nouvelle demande) : un lien plus
  // récent existe — message distinct d'une expiration naturelle.
  if (isReplacedToken(sig.tokenExpiresAt)) {
    return { status: 'replaced', reference: sig.bon.reference };
  }
  if (new Date() > sig.tokenExpiresAt) {
    return { status: 'expired', reference: sig.bon.reference };
  }

  return {
    status: 'pending',
    bon: sanitizeBonForResponse(sig.bon),
    signature: toSafeSignature(sig as unknown as Record<string, unknown>),
  };
}
