import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NON_SIGNABLE_BON_STATUSES, isBonStatusIn } from '../bons/bon-status';
import { NOT_RECIPIENT_MESSAGE, isRecipient } from './recipient';
import { isReplacedToken, unusableLinkMessage } from './token';
import type { LinkDocumentType } from './token-lifecycle';

/**
 * « Demander un nouveau lien » depuis un lien expiré (R-058). Le collaborateur
 * n'est pas laissé dans une impasse : l'équipe informatique est prévenue par
 * email (`link_request_alert`), avec un lien direct vers le bon. Aucun lien
 * n'est renvoyé automatiquement : c'est l'IT qui renvoie le document, selon
 * l'état du bon (compte désactivé, adresse, présentiel).
 *
 * Limite de débit : une alerte par bon toutes les 24 heures (l'appel suivant
 * répond « déjà demandé » sans nouvel email), en plus de la limite par
 * adresse IP de la route.
 */

export const LINK_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Ce que l'alerte à l'IT doit dire. */
export interface LinkRequestAlert {
  bonId: string;
  documentType: LinkDocumentType;
  requesterEmail: string;
  expiredAt: Date;
}

export interface LinkRequestDeps {
  prisma: PrismaService;
  /** Lance l'alerte à l'IT sans l'attendre : la réponse au collaborateur ne
   *  dépend pas du serveur de messagerie (l'envoi trace lui-même ses échecs). */
  alertIt: (alert: LinkRequestAlert) => void;
  now?: () => Date;
}

export interface LinkRequestResult {
  ok: true;
  /** `requested` : l'IT vient d'être prévenue ; `already_requested` : une
   *  demande de moins de 24 h existe déjà, rien n'est renvoyé. */
  status: 'requested' | 'already_requested';
  requestedAt: Date;
}

/** Action du journal d'audit d'une demande de nouveau lien. */
export const LINK_REQUEST_AUDIT_ACTION = 'signature_link_requested';

/** Date de la dernière demande de nouveau lien du bon, depuis `since`. Lue
 *  dans le journal d'audit, écrit AVANT l'email : une panne d'envoi ne
 *  permet pas de contourner la limite. */
export async function lastLinkRequestAt(prisma: PrismaService, bonId: string, since: Date): Promise<Date | null> {
  const last = await prisma.auditLog.findFirst({
    where: { bonId, action: LINK_REQUEST_AUDIT_ACTION, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

async function loadExpiredLink(prisma: PrismaService, token: string, requester: { email?: string; id?: string }) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    select: {
      type: true, signed: true, isInPerson: true, tokenExpiresAt: true, invalidatedReason: true, createdAt: true,
      bon: { select: { id: true, status: true, collaborateurId: true, collaborateurEmail: true } },
    },
  });
  if (!sig) throw new NotFoundException('Lien de signature invalide');
  if (!isRecipient(sig.bon, sig.isInPerson, requester.email, requester.id)) throw new ForbiddenException(NOT_RECIPIENT_MESSAGE);
  if (sig.signed) throw new BadRequestException('Ce document a déjà été signé.');
  if (isBonStatusIn(sig.bon.status, NON_SIGNABLE_BON_STATUSES)) {
    throw new BadRequestException("Ce bon n'attend plus de signature.");
  }
  if (isReplacedToken(sig.tokenExpiresAt)) throw new BadRequestException(unusableLinkMessage(sig, sig.bon.status));
  if (sig.tokenExpiresAt.getTime() > Date.now()) {
    throw new BadRequestException('Ce lien est encore valable : vous pouvez signer le document.');
  }
  if (sig.isInPerson) {
    throw new BadRequestException(
      "Ce lien de signature au guichet a expiré : demandez à l'équipe informatique de rouvrir la signature sur place.",
    );
  }
  return sig;
}

export async function requestNewLink(
  deps: LinkRequestDeps,
  token: string,
  requester: { email: string; id?: string },
): Promise<LinkRequestResult> {
  const now = deps.now?.() ?? new Date();
  const sig = await loadExpiredLink(deps.prisma, token, requester);
  const previous = await lastLinkRequestAt(deps.prisma, sig.bon.id, new Date(now.getTime() - LINK_REQUEST_COOLDOWN_MS));
  if (previous) return { ok: true, status: 'already_requested', requestedAt: previous };

  await deps.prisma.auditLog.create({
    data: {
      bonId: sig.bon.id,
      userId: requester.id ?? null,
      userEmail: requester.email,
      action: LINK_REQUEST_AUDIT_ACTION,
      // Même instant que la réponse : c'est la date que la page affichera.
      createdAt: now,
      details: { documentType: sig.type, expiredAt: sig.tokenExpiresAt.toISOString() },
    },
  });
  deps.alertIt({
    bonId: sig.bon.id,
    documentType: sig.type as LinkDocumentType,
    requesterEmail: requester.email,
    expiredAt: sig.tokenExpiresAt,
  });
  return { ok: true, status: 'requested', requestedAt: now };
}
