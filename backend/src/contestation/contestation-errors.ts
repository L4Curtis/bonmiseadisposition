import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { ContestationOutcome, ContestationStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors';
import type { ContestationAlreadyHandledDetails, ContestationErrorCode } from '../contracts/contestations';

/**
 * Erreurs des contestations que l'écran reconnaît par leur code
 * (`ContestationErrorCode` du contrat, ou un code commun), à la forme unique
 * `{ statusCode, code, message, details? }` (docs/api-conventions.md § Erreurs).
 */

function contestationError(code: ContestationErrorCode, message: string, details?: object): AppException {
  return new AppException(code, message, HttpStatus.CONFLICT, details);
}

/** 404 d'une contestation inconnue. */
export function contestationNotFoundError(): NotFoundException {
  return new NotFoundException('Contestation introuvable');
}

/** 409 : une contestation attend déjà une décision sur ce bon. */
export function contestationAlreadyOpenError(message = 'Une contestation est déjà en cours sur ce bon.'): AppException {
  return contestationError('contestation_already_open', message);
}

/** État d'une contestation qu'un collègue a traitée entre-temps. */
export interface HandledContestation {
  readonly status: ContestationStatus;
  readonly outcome: ContestationOutcome | null;
  readonly reviewedBy: { readonly displayName: string } | null;
  readonly resolvedBy: { readonly displayName: string } | null;
}

/** Ce qu'il faut lire d'une contestation pour expliquer le refus. */
export const HANDLED_CONTESTATION_SELECT = {
  status: true,
  outcome: true,
  reviewedBy: { select: { displayName: true } },
  resolvedBy: { select: { displayName: true } },
} satisfies Prisma.ContestationSelect;

const OUTCOME_LABEL: Readonly<Record<ContestationOutcome, string>> = { founded: 'Fondée', not_retained: 'Non retenue' };

function handledMessage(row: HandledContestation, by: string | null): string {
  const suffix = by ? ` par ${by}` : '';
  if (row.status === 'open' || row.status === 'in_review') return `Cette contestation est déjà prise en charge${suffix}.`;
  const outcome = row.outcome ? ` (« ${OUTCOME_LABEL[row.outcome]} »)` : '';
  return `Cette contestation a déjà été tranchée${suffix}${outcome}.`;
}

/** 409 : un autre membre de l'équipe a pris en charge ou tranché la
 *  contestation entre-temps. Le message dit qui et ce qu'il a décidé ;
 *  `details` le redonne à l'écran, qui recharge alors la liste. */
export function contestationAlreadyHandledError(row: HandledContestation): AppException {
  const pending = row.status === 'open' || row.status === 'in_review';
  const by = (pending ? row.reviewedBy : row.resolvedBy ?? row.reviewedBy)?.displayName ?? null;
  const details: ContestationAlreadyHandledDetails = { status: row.status, outcome: row.outcome, by };
  return contestationError('contestation_already_handled', handledMessage(row, by), details);
}

/** 409 : le bon ou le document à contester a changé depuis l'affichage. */
export function contestationStaleError(message: string): AppException {
  return new AppException('conflict', message, HttpStatus.CONFLICT);
}
