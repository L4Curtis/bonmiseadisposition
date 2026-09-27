import type { SerialConflict } from '../types';

/**
 * Conflits de numéros de série à montrer pour le bon en cours de saisie. Le
 * bon qu'un bon remplaçant remplace (contestation Fondée sur une remise)
 * porte forcément les mêmes numéros : ce n'est pas un conflit, puisque
 * l'original sera clôturé « remplacé » à la signature du remplaçant. Même
 * règle que le contrôle d'avant la remise (bons/workflow/bon-send-checks.ts).
 */
export function withoutReplacedBon(
  conflicts: readonly SerialConflict[],
  replacedBonId: string | null | undefined,
): SerialConflict[] {
  if (!replacedBonId) return [...conflicts];
  return conflicts.filter((c) => c.bonId !== replacedBonId);
}
