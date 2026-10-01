import { BadRequestException, Logger } from '@nestjs/common';
import type { BonStatus, ContestationOutcome, Prisma, SignatureType } from '@prisma/client';
import { BON_REFERENCE_TX_OPTIONS } from '../common/bon-reference';
import { INVALIDATED_TOKEN_SENTINEL } from '../common/bon-predicates';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import type { BonCorrector, ReopenableDocument } from './bon-correction.port';
import {
  CONTESTATION_BON_WITH_STATUS,
  CONTESTATION_PEOPLE_INCLUDE,
  PENDING_CONTESTATION_STATUSES,
} from './contestation-selects';
import { writeAuditEntry } from '../audit/audit-record';
import {
  HANDLED_CONTESTATION_SELECT,
  contestationAlreadyHandledError,
  contestationNotFoundError,
  contestationStaleError,
} from './contestation-errors';

export interface ResolveContestationDeps {
  prisma: PrismaService;
  notificationService: NotificationService;
  corrector: BonCorrector;
  logger: Logger;
}

export interface ResolveContestationInput {
  contestationId: string;
  actorId: string;
  outcome: ContestationOutcome;
  resolutionMessage?: string;
}

/** Décision prête à écrire : réponse nettoyée, `null` si absente. */
interface DecisionInput {
  contestationId: string;
  actorId: string;
  outcome: ContestationOutcome;
  resolutionMessage: string | null;
}

/** Statut du bon avant la contestation. Une contestation antérieure à la
 *  vague 2 n'a pas la colonne : seul un bon « En cours » était contestable. */
function statusToRestore(previous: BonStatus | null): BonStatus {
  return previous ?? 'active';
}

/** Le document contesté est faux : son lien éventuel ne doit plus pouvoir
 *  être signé. Motif `contested`, pas `replaced` : aucun nouveau lien n'est
 *  encore parti (le remplaçant est un brouillon), la page de signature ne
 *  doit donc pas l'annoncer. */
async function invalidateContestedLinks(tx: Prisma.TransactionClient, bonId: string, now: Date): Promise<void> {
  await tx.signature.updateMany({
    where: { bonId, signed: false, invalidatedAt: null, tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL } },
    data: { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: 'contested' },
  });
}

type ReplacementBon = { id: string; reference: string; status: BonStatus };

/** Suite d'une contestation Fondée (décision du 26/09) :
 *  - remise contestée : un bon remplaçant, brouillon prérempli que l'IT
 *    corrige puis envoie ;
 *  - restitution ou PV contesté : le bon d'origine est rouvert pour être
 *    corrigé, puis le document est renvoyé à signer. */
export type FoundedCorrection =
  | { kind: 'replacement'; replacement: ReplacementBon }
  | { kind: 'reopened'; document: ReopenableDocument };

/** Document que la correction fait resigner sur le bon d'origine, ou `null`
 *  s'il faut un bon remplaçant (remise, ou contestation d'avant la vague 2). */
export function reopenableDocument(contested: SignatureType | null): ReopenableDocument | null {
  return contested === 'restitution' || contested === 'pv_cloture' ? contested : null;
}

interface ContestationToDecide {
  id: string;
  bonId: string;
  previousBonStatus: BonStatus | null;
  contestedDocument: SignatureType | null;
}

/** Corrige le bon d'une contestation Fondée, dans la transaction de la
 *  décision, le bon étant déjà revenu à son statut d'avant. */
async function correctFoundedBon(
  deps: ResolveContestationDeps,
  tx: Prisma.TransactionClient,
  contestation: ContestationToDecide,
  actorId: string,
  now: Date,
): Promise<FoundedCorrection> {
  const document = reopenableDocument(contestation.contestedDocument);
  if (document) {
    // Invalide lui-même le lien du document (motif « contesté ») et, pour une
    // restitution, la signature IT qui l'accompagnait.
    await deps.corrector.reopenForCorrection(contestation.bonId, document, actorId, tx);
    return { kind: 'reopened', document };
  }
  await invalidateContestedLinks(tx, contestation.bonId, now);
  const replacement = await deps.corrector.createReplacementBon(tx, contestation.bonId, contestation.id, actorId);
  return { kind: 'replacement', replacement };
}

/** Écrit la décision, rétablit le bon et, pour une contestation Fondée, le
 *  fait corriger : tout ou rien. */
async function applyDecision(
  deps: ResolveContestationDeps,
  tx: Prisma.TransactionClient,
  contestation: ContestationToDecide,
  input: DecisionInput,
): Promise<FoundedCorrection | null> {
  const founded = input.outcome === 'founded';
  const now = new Date();
  const claimed = await tx.contestation.updateMany({
    where: { id: contestation.id, status: { in: [...PENDING_CONTESTATION_STATUSES] } },
    data: {
      status: founded ? 'resolved' : 'rejected',
      outcome: input.outcome,
      resolvedById: input.actorId,
      resolvedAt: now,
      resolutionMessage: input.resolutionMessage,
    },
  });
  if (claimed.count === 0) {
    const current = await tx.contestation.findUniqueOrThrow({ where: { id: contestation.id }, select: HANDLED_CONTESTATION_SELECT });
    throw contestationAlreadyHandledError(current);
  }

  // Lecture fraîche, dans la transaction : le bon a pu changer entre-temps.
  const fresh = await tx.bon.findUnique({ where: { id: contestation.bonId }, select: { status: true } });
  if (fresh?.status !== 'contested') throw contestationStaleError("Ce bon n'est plus au statut contesté.");

  const restoredStatus = statusToRestore(contestation.previousBonStatus);
  await tx.bon.update({ where: { id: contestation.bonId }, data: { status: restoredStatus } });

  const correction = founded ? await correctFoundedBon(deps, tx, contestation, input.actorId, now) : null;

  await writeAuditEntry(tx, founded ? 'contestation_resolved' : 'contestation_rejected', {
    actorId: input.actorId,
    bonId: contestation.bonId,
    details: {
      contestationId: contestation.id,
      outcome: input.outcome,
      resolutionMessage: input.resolutionMessage,
      restoredStatus,
      replacementBonId: correction?.kind === 'replacement' ? correction.replacement.id : null,
      reopenedDocument: correction?.kind === 'reopened' ? correction.document : null,
    },
  });
  return correction;
}

/**
 * Tranche une contestation (décision du 24/09) :
 *  - « Non retenue » : rien ne change, le bon reprend son statut ; une réponse
 *    au collaborateur est obligatoire ;
 *  - « Fondée » : on corrige toujours. Le bon reprend son statut (le matériel
 *    reste chez le collaborateur, dans l'inventaire et le portail), puis :
 *    remise contestée, un bon remplaçant est créé (l'original sera clôturé
 *    « remplacé » à la signature du remplaçant) ; restitution ou PV contesté,
 *    le bon d'origine est rouvert pour correction (`reopenedDocument`), sans
 *    nouveau bon.
 */
export async function resolveContestation(deps: ResolveContestationDeps, input: ResolveContestationInput) {
  const resolutionMessage = input.resolutionMessage?.trim() || null;
  if (input.outcome === 'not_retained' && !resolutionMessage) {
    throw new BadRequestException(
      "Une réponse au collaborateur est obligatoire quand la contestation n'est pas retenue.",
    );
  }

  const contestation = await deps.prisma.contestation.findUnique({
    where: { id: input.contestationId },
    include: {
      bon: { include: { filiale: true, collaborateur: { select: { id: true, displayName: true, email: true } } } },
      user: { select: { id: true, displayName: true, email: true } },
    },
  });
  if (!contestation) throw contestationNotFoundError();

  // BON_REFERENCE_TX_OPTIONS : la création d'un remplaçant numérote un bon sous
  // verrou, ce qui peut dépasser le délai par défaut d'une transaction Prisma.
  const correction = await deps.prisma.$transaction(
    (tx) => applyDecision(deps, tx, contestation, { ...input, resolutionMessage }),
    BON_REFERENCE_TX_OPTIONS,
  );

  const replacement = correction?.kind === 'replacement' ? correction.replacement : null;
  deps.notificationService
    .sendContestationResolution(
      contestation.bon,
      contestation.user,
      input.outcome === 'founded' ? 'resolved' : 'rejected',
      resolutionMessage ?? undefined,
      replacement,
      correction?.kind === 'reopened' ? correction.document : null,
    )
    .catch((err: unknown) =>
      deps.logger.warn(
        `Réponse à la contestation ${contestation.id} non envoyée : ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

  const updated = await deps.prisma.contestation.findUniqueOrThrow({
    where: { id: contestation.id },
    include: { ...CONTESTATION_PEOPLE_INCLUDE, bon: CONTESTATION_BON_WITH_STATUS },
  });
  return {
    ...updated,
    replacementBon: replacement,
    reopenedDocument: correction?.kind === 'reopened' ? correction.document : null,
  };
}
