import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ContestableDocument, resolveContestedDocument } from './contested-document';
import { PENDING_CONTESTATION_STATUSES } from './contestation-selects';

export interface CreateContestationDeps {
  prisma: PrismaService;
  notificationService: NotificationService;
  logger: Logger;
}

export interface CreateContestationInput {
  bonId: string;
  userId: string;
  message: string;
  /** Document que l'écran croit contester : refusé s'il ne l'est plus. */
  document?: ContestableDocument;
}

/** Bon à contester, et les documents qui attendent encore la signature du
 *  collaborateur (liens non signés, non invalidés ; expirés compris). */
async function loadBon(prisma: PrismaService, bonId: string) {
  const bon = await prisma.bon.findUnique({
    where: { id: bonId },
    include: {
      filiale: true,
      collaborateur: { select: { id: true, displayName: true, email: true } },
    },
  });
  if (!bon) throw new NotFoundException('Bon introuvable');
  const pending = await prisma.signature.findMany({
    where: {
      bonId,
      signed: false,
      type: { not: 'it_cachet' },
      invalidatedAt: null,
      tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
    },
    select: { type: true },
  });
  const pendingDocuments = pending.map((s) => s.type).filter((t): t is ContestableDocument => t !== 'it_cachet');
  return { bon, pendingDocuments };
}

type LoadedBon = Awaited<ReturnType<typeof loadBon>>['bon'];

/** Décide du document contesté, ou refuse avec le bon code HTTP. */
function contestedDocumentOf(
  bon: LoadedBon,
  pendingDocuments: readonly ContestableDocument[],
  requested: ContestableDocument | undefined,
): ContestableDocument {
  const result = resolveContestedDocument({ status: bon.status, pendingDocuments });
  if (!result.contestable) {
    if (bon.status === 'contested') throw new ConflictException(result.message);
    throw new BadRequestException(result.message);
  }
  if (requested && requested !== result.document) {
    throw new ConflictException("Le document à contester a changé entre-temps : rechargez la page.");
  }
  return result.document;
}

/**
 * Le titulaire du bon conteste un document. Le bon passe « Contesté » et garde
 * en colonne son statut d'avant, rétabli quand l'équipe informatique tranche.
 *
 * Les liens de signature en attente ne sont PAS invalidés : tant que le bon
 * est contesté, la page de signature l'annonce et la signature est refusée
 * (signing.ts) ; si la contestation n'est pas retenue, rien n'a changé et le
 * lien resservira.
 */
export async function createContestation(deps: CreateContestationDeps, input: CreateContestationInput) {
  const message = input.message.trim();
  if (!message) throw new BadRequestException('Le motif de la contestation est obligatoire');

  const { bon, pendingDocuments } = await loadBon(deps.prisma, input.bonId);
  if (bon.collaborateurId !== input.userId) {
    throw new ForbiddenException('Vous ne pouvez contester que vos propres bons');
  }
  const document = contestedDocumentOf(bon, pendingDocuments, input.document);

  // Une seule transaction : « pas déjà ouverte », création et passage du bon
  // en « Contesté » sont atomiques (un double appui ne crée pas deux
  // contestations ; un bon qui a changé de statut entre-temps n'est pas contesté).
  const contestation = await deps.prisma.$transaction(async (tx) => {
    const existing = await tx.contestation.findFirst({
      where: { bonId: bon.id, status: { in: [...PENDING_CONTESTATION_STATUSES] } },
    });
    if (existing) throw new ConflictException('Une contestation est déjà en cours sur ce bon.');

    const created = await tx.contestation.create({
      data: {
        bonId: bon.id,
        userId: input.userId,
        message,
        status: 'open',
        previousBonStatus: bon.status,
        contestedDocument: document,
      },
      include: {
        bon: { select: { id: true, reference: true } },
        user: { select: { id: true, displayName: true, email: true } },
      },
    });

    const claimed = await tx.bon.updateMany({
      where: { id: bon.id, status: bon.status },
      data: { status: 'contested' },
    });
    if (claimed.count === 0) throw new ConflictException("Le bon a changé entre-temps : rechargez la page.");

    await tx.auditLog.create({
      data: {
        bonId: bon.id,
        userId: input.userId,
        action: 'bon_contested',
        details: { contestationId: created.id, document, previousStatus: bon.status, message: message.slice(0, 200) },
      },
    });
    return created;
  });

  // Alerte à l'équipe informatique, sans faire attendre le collaborateur.
  deps.notificationService.sendContestationAlert(bon, contestation.user, message).catch((err: unknown) =>
    deps.logger.warn(
      `Alerte de contestation non envoyée pour le bon ${bon.reference} : ${err instanceof Error ? err.message : String(err)}`,
    ),
  );

  return contestation;
}
