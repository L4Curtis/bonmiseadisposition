import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobKey } from './job-registry';
import { JobRunStatus } from './job-late.util';

const MAX_ERROR_LENGTH = 500;

/** Résultat qu'une tâche planifiée peut renvoyer à `track()` pour signaler
 *  qu'elle est sortie tôt sans rien faire (désactivée en configuration,
 *  fonctionnalité désactivée, etc.) — toute autre valeur de retour (y compris
 *  void) est considérée comme un succès. */
export type JobOutcome = 'skipped';

function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}

/**
 * Enregistreur d'exécution des tâches planifiées (lot A5, supervision).
 * `track(job, fn)` journalise le début, exécute `fn`, puis journalise la fin
 * (statut, durée, erreur tronquée le cas échéant) dans ScheduledJobRun.
 *
 * Règle absolue : le suivi ne doit JAMAIS faire échouer ni ralentir
 * significativement la tâche surveillée. Toute erreur d'écriture du suivi
 * est journalisée par le logger applicatif et avalée — jamais propagée.
 * `fn` elle-même n'est ni interceptée ni transformée : sa valeur de retour
 * est renvoyée telle quelle et une exception qu'elle lève est re-lancée
 * inchangée, pour que le comportement existant de chaque tâche (relancée ou
 * avalée par son propre appelant) reste strictement identique.
 */
@Injectable()
export class JobTrackerService {
  private readonly logger = new Logger(JobTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track<T>(job: JobKey, fn: () => Promise<T | JobOutcome>): Promise<T | JobOutcome> {
    const lastStartedAt = new Date();
    await this.safeWrite(job, () =>
      this.prisma.scheduledJobRun.upsert({
        where: { job },
        create: { job, lastStartedAt },
        update: { lastStartedAt },
      }),
    );

    try {
      const result = await fn();
      const status: JobRunStatus = result === 'skipped' ? 'skipped' : 'success';
      await this.recordFinish(job, lastStartedAt, status, null);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordFinish(job, lastStartedAt, 'error', truncateErrorMessage(message));
      throw err;
    }
  }

  private async recordFinish(
    job: JobKey,
    lastStartedAt: Date,
    lastStatus: JobRunStatus,
    lastError: string | null,
  ): Promise<void> {
    const lastFinishedAt = new Date();
    const lastDurationMs = lastFinishedAt.getTime() - lastStartedAt.getTime();
    await this.safeWrite(job, () =>
      this.prisma.scheduledJobRun.upsert({
        where: { job },
        create: { job, lastStartedAt, lastFinishedAt, lastStatus, lastError, lastDurationMs },
        update: { lastFinishedAt, lastStatus, lastError, lastDurationMs },
      }),
    );
  }

  private async safeWrite(job: JobKey, op: () => Promise<unknown>): Promise<void> {
    try {
      await op();
    } catch (err: unknown) {
      this.logger.error(
        `Suivi de la tâche planifiée "${job}" non enregistré : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
