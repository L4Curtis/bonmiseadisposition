import { BadRequestException, ConflictException } from '@nestjs/common';
import type { BonActionName } from '../../contracts/bons';
import { BonDetailRow } from '../bon-view';
import { computeBonFacts } from './bon-facts';
import { actionBlockedReason, BonFacts } from './state-machine';

/**
 * Garde commune des actions du cycle de vie : l'action doit être permise par
 * la machine à états dans l'état ACTUEL du bon, sinon 400 avec le motif en
 * français (le même que l'écran affiche à côté du bouton grisé).
 */
export function assertActionAllowed(bon: BonDetailRow, action: BonActionName, now: number = Date.now()): BonFacts {
  const facts = computeBonFacts(bon, now);
  const reason = actionBlockedReason(action, facts);
  if (reason) throw new BadRequestException(reason);
  return facts;
}

/** Une transition conditionnelle a perdu la course contre une autre action. */
export function statusChangedMeanwhile(): ConflictException {
  return new ConflictException('Le statut du bon a changé entre-temps : rechargez la page.');
}

/** Motif obligatoire d'un geste tracé (annulation, gestes sans signature). */
export function requireReason(reason: string | undefined, what: string): string {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length < 10) {
    throw new BadRequestException(`Le motif ${what} est obligatoire (10 caractères au moins).`);
  }
  return trimmed;
}
