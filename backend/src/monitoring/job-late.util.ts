export type JobRunStatus = 'success' | 'error' | 'skipped';

export interface JobLateInput {
  lastFinishedAt: Date | null;
  lastStatus: JobRunStatus | null;
  /**
   * Seuil d'alerte (ms) : au-delà de cette durée, la tâche est "en retard".
   * Un seuil explicite par tâche (job-registry.ts), pas un multiple mécanique
   * de l'intervalle nominal — voir JobDefinition.alertAfterHours.
   */
  thresholdMs: number;
  now: Date;
  /** Horodatage de démarrage du process courant. */
  processStartedAt: Date;
}

/**
 * Une tâche est "en retard" quand :
 * - sa dernière fin RÉUSSIE ou IGNORÉE (skipped) date de plus que le seuil
 *   d'alerte ;
 * - ou elle n'a JAMAIS terminé d'exécution (lastFinishedAt nul) depuis plus
 *   longtemps que ce même seuil après le démarrage du process — pas
 *   d'alerte au premier démarrage, le temps que le premier passage ait lieu.
 *
 * Une dernière exécution en erreur n'est PAS traitée comme "en retard" : le
 * pastille "erreur" porte déjà l'information (avec le message), et une
 * tâche qui échoue à l'heure prévue n'est pas en retard, elle est en échec —
 * mélanger les deux masquerait la distinction utile pour l'admin.
 */
export function isJobLate(input: JobLateInput): boolean {
  const { lastFinishedAt, lastStatus, thresholdMs, now, processStartedAt } = input;

  if (lastFinishedAt === null) {
    return now.getTime() - processStartedAt.getTime() > thresholdMs;
  }
  if (lastStatus === 'error') return false;
  return now.getTime() - lastFinishedAt.getTime() > thresholdMs;
}
