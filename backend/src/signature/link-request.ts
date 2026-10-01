import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockBonLinks } from '../bons/workflow/bon-links';
import { NON_SIGNABLE_BON_STATUSES, isBonStatusIn } from '../bons/bon-status';
import { NOT_RECIPIENT_MESSAGE, isRecipient } from './recipient';
import { isReplacedToken, unusableLinkMessage } from './token';
import type { LinkDocumentType } from './token-lifecycle';
import { writeAuditEntry } from '../audit/audit-record';
import type { AuditAction } from '../audit/audit-actions';

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
export const LINK_REQUEST_AUDIT_ACTION = 'signature_link_requested' satisfies AuditAction;

/** Demandes relues pour un bon : bien plus que n'en produit un bon (une par
 *  lien expiré), sans lire tout l'historique d'un bon très ancien. */
const LINK_REQUESTS_READ = 50;

/** Demande de nouveau lien telle que le journal la garde. */
export interface LinkRequestRecord {
  readonly createdAt: Date;
  /** `details` de l'entrée : `signatureId` = lien expiré visé. */
  readonly details: unknown;
}

/** Lien de signature qu'une demande peut viser. */
export interface LinkTarget {
  readonly id?: string;
  readonly createdAt: Date | string;
}

/** Identifiant du lien expiré visé par une demande, `null` pour une demande
 *  enregistrée avant que le journal ne le garde. */
export function requestedLinkId(details: unknown): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const id = (details as { signatureId?: unknown }).signatureId;
  return typeof id === 'string' ? id : null;
}

/**
 * La demande vise-t-elle ce lien ? On compare l'identifiant du lien expiré
 * qu'elle a enregistré : l'heure du serveur d'application et celle de la base
 * peuvent différer de quelques secondes, et un renvoi juste après une demande
 * ne doit pas passer pour antérieur. Une demande ancienne, sans identifiant,
 * est comparée à la date d'émission du lien.
 */
export function requestTargetsLink(request: LinkRequestRecord, link: LinkTarget): boolean {
  const id = requestedLinkId(request.details);
  if (id !== null) return id === link.id;
  return request.createdAt.getTime() >= new Date(link.createdAt).getTime();
}

type AuditReader = Pick<PrismaService | Prisma.TransactionClient, 'auditLog'>;

function readLinkRequests(prisma: AuditReader, bonId: string) {
  return prisma.auditLog.findMany({
    where: { bonId, action: LINK_REQUEST_AUDIT_ACTION },
    orderBy: { createdAt: 'desc' },
    take: LINK_REQUESTS_READ,
    select: { createdAt: true, details: true },
  });
}

/** Date de la demande de nouveau lien faite pour ce lien, `null` s'il n'y en
 *  a pas. Lue dans le journal d'audit, écrit AVANT l'email : une panne
 *  d'envoi ne permet pas de contourner la limite. */
export async function linkRequestedAt(prisma: AuditReader, bonId: string, link: LinkTarget): Promise<Date | null> {
  const requests = await readLinkRequests(prisma, bonId);
  return requests.find((r) => requestTargetsLink(r, link))?.createdAt ?? null;
}

/** Dernière demande de nouveau lien d'un bon, pour la fiche IT. */
export async function lastLinkRequest(prisma: AuditReader, bonId: string): Promise<LinkRequestRecord | null> {
  const [last] = await readLinkRequests(prisma, bonId);
  return last ?? null;
}

async function loadExpiredLink(prisma: PrismaService, token: string, requester: { email?: string; id?: string }) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    select: {
      id: true, type: true, signed: true, isInPerson: true, tokenExpiresAt: true, invalidatedReason: true, createdAt: true,
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
  const outcome = await deps.prisma.$transaction(async (tx) => {
    await lockBonLinks(tx, sig.bon.id);
    const last = await linkRequestedAt(tx, sig.bon.id, sig);
    if (last) return { previous: true, requestedAt: last };
    await writeAuditEntry(tx, LINK_REQUEST_AUDIT_ACTION, {
      actorId: requester.id ?? null,
      actorEmail: requester.email,
      bonId: sig.bon.id,
      // Le lien expiré visé : un renvoi de l'IT crée un autre lien, qui
      // autorise une nouvelle demande (voir requestTargetsLink).
      details: { documentType: sig.type, expiredAt: sig.tokenExpiresAt.toISOString(), signatureId: sig.id },
    });
    // La date affichée est celle du journal (horloge de la base), la même que
    // la fiche IT et le portail reliront ensuite.
    return { previous: false, requestedAt: (await linkRequestedAt(tx, sig.bon.id, sig)) ?? now };
  });
  if (outcome.previous) return { ok: true, status: 'already_requested', requestedAt: outcome.requestedAt };

  deps.alertIt({
    bonId: sig.bon.id,
    documentType: sig.type as LinkDocumentType,
    requesterEmail: requester.email,
    expiredAt: sig.tokenExpiresAt,
  });
  return { ok: true, status: 'requested', requestedAt: outcome.requestedAt };
}

/** Ce qu'il faut d'un bon présenté pour y ajouter la demande de nouveau lien. */
interface WithPendingSignature {
  id: string;
  signatures: readonly { id: string; type: string; signed: boolean; createdAt: Date | string }[];
  pendingSignature: { type: string; sentAt: string | null; newLinkRequestedAt?: string | null } | null;
}

/** Dernier lien du document en attente ; à défaut (lien purgé), la date
 *  d'envoi annoncée. */
function pendingLink(bon: WithPendingSignature & { pendingSignature: object }): LinkTarget {
  const { type, sentAt } = bon.pendingSignature as { type: string; sentAt: string | null };
  const latest = bon.signatures
    .filter((s) => s.type === type && !s.signed)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return latest ?? { createdAt: sentAt ?? new Date(0) };
}

/**
 * Ajoute à `pendingSignature` la date de la demande de nouveau lien faite
 * pour le dernier lien du document en attente (`null` s'il n'y en a pas) :
 * le portail dit alors « Nouveau lien demandé le … » au lieu de reproposer la
 * demande. Une seule lecture du journal pour tous les bons.
 */
export async function attachNewLinkRequests<T extends WithPendingSignature>(prisma: PrismaService, bons: readonly T[]): Promise<T[]> {
  const pendingIds = bons.filter((b) => b.pendingSignature).map((b) => b.id);
  const requests = pendingIds.length === 0 ? [] : await prisma.auditLog.findMany({
    where: { bonId: { in: pendingIds }, action: LINK_REQUEST_AUDIT_ACTION },
    orderBy: { createdAt: 'desc' },
    select: { bonId: true, createdAt: true, details: true },
  });
  return bons.map((bon) => {
    if (!bon.pendingSignature) return bon;
    const link = pendingLink(bon as T & { pendingSignature: object });
    const last = requests.find((r) => r.bonId === bon.id && requestTargetsLink(r, link));
    return { ...bon, pendingSignature: { ...bon.pendingSignature, newLinkRequestedAt: last ? last.createdAt.toISOString() : null } };
  });
}
