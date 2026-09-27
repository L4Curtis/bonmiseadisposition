import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockBonLinks } from '../bons/workflow/bon-links';
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
 * Une seule alerte par lien en attente : tant que l'IT n'a pas renvoyé le
 * document (un renvoi crée un nouveau lien), les demandes suivantes répondent
 * « déjà demandé », avec la date de la première, sans nouvel email. La lecture
 * et l'écriture de la demande se font sous le verrou des liens du bon : deux
 * demandes simultanées (double clic, deux onglets) ne donnent qu'une alerte.
 * En plus de la limite par adresse IP de la route.
 */

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
   *  demande existe déjà pour ce lien, l'IT n'est pas réalertée. */
  status: 'requested' | 'already_requested';
  requestedAt: Date;
}

/** Action du journal d'audit d'une demande de nouveau lien. */
export const LINK_REQUEST_AUDIT_ACTION = 'signature_link_requested';

/** Date de la dernière demande de nouveau lien du bon, depuis `since`. Lue
 *  dans le journal d'audit, écrit AVANT l'email : une panne d'envoi ne
 *  permet pas de contourner la limite. */
export async function lastLinkRequestAt(
  prisma: PrismaService | Prisma.TransactionClient,
  bonId: string,
  since: Date,
): Promise<Date | null> {
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
  const previous = await deps.prisma.$transaction(async (tx) => {
    await lockBonLinks(tx, sig.bon.id);
    const last = await lastLinkRequestAt(tx, sig.bon.id, sig.createdAt);
    if (last) return last;
    await tx.auditLog.create({
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
    return null;
  });
  if (previous) return { ok: true, status: 'already_requested', requestedAt: previous };

  deps.alertIt({
    bonId: sig.bon.id,
    documentType: sig.type as LinkDocumentType,
    requesterEmail: requester.email,
    expiredAt: sig.tokenExpiresAt,
  });
  return { ok: true, status: 'requested', requestedAt: now };
}

/** Ce qu'il faut d'un bon présenté pour y ajouter la demande de nouveau lien. */
interface WithPendingSignature {
  id: string;
  pendingSignature: { sentAt: string | null; newLinkRequestedAt?: string | null } | null;
}

/**
 * Ajoute à `pendingSignature` la date de la demande de nouveau lien faite
 * depuis l'envoi du dernier lien (`null` s'il n'y en a pas) : le portail dit
 * alors « Nouveau lien demandé le … » au lieu de reproposer la demande. Une
 * seule lecture du journal pour tous les bons.
 */
export async function attachNewLinkRequests<T extends WithPendingSignature>(prisma: PrismaService, bons: readonly T[]): Promise<T[]> {
  const pendingIds = bons.filter((b) => b.pendingSignature).map((b) => b.id);
  const requests = pendingIds.length === 0 ? [] : await prisma.auditLog.findMany({
    where: { bonId: { in: pendingIds }, action: LINK_REQUEST_AUDIT_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { bonId: true, createdAt: true },
  });
  return bons.map((bon) => {
    if (!bon.pendingSignature) return bon;
    const since = bon.pendingSignature.sentAt ? new Date(bon.pendingSignature.sentAt).getTime() : 0;
    const last = requests.find((r) => r.bonId === bon.id && r.createdAt.getTime() >= since);
    return { ...bon, pendingSignature: { ...bon.pendingSignature, newLinkRequestedAt: last ? last.createdAt.toISOString() : null } };
  });
}
