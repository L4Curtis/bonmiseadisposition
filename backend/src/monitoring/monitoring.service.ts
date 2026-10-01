import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigRegistryService } from '../config/config-registry.service';
import type { AdminStatusJob, AdminStatusResponse } from '../contracts/admin';
import { JOB_KEYS, JOB_REGISTRY, JobDefinition } from './job-registry';
import { isJobLate, JobRunStatus } from './job-late.util';
import { checkDatabase } from './database-check.util';

const HOUR_MS = 60 * 60 * 1000;
/** La synchronisation de l'annuaire passe toutes les 6 h au plus souvent. */
const LDAP_SYNC_CRON_HOURS = 6;

export type { AdminStatusJob };
export type AdminStatus = AdminStatusResponse;

/** Agrège les informations affichées par GET /api/admin/status (lot A5,
 *  supervision) : version/commit déployés, disponibilité de la base, dernier
 *  passage de chaque tâche planifiée. */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ConfigRegistryService,
  ) {}

  async getAdminStatus(): Promise<AdminStatus> {
    const now = new Date();
    // Horodatage de démarrage du process, dérivé de process.uptime() — sert
    // uniquement à ne pas déclencher "en retard" juste après un déploiement,
    // avant qu'une tâche n'ait eu le temps de s'exécuter une première fois.
    const processStartedAt = new Date(now.getTime() - process.uptime() * 1000);

    const [database, runs, ldapAlertAfterHours] = await Promise.all([
      checkDatabase(this.prisma),
      this.prisma.scheduledJobRun.findMany({
        where: { job: { in: JOB_REGISTRY.map((def) => def.job) } },
      }),
      this.resolveLdapSyncAlertAfterHours(),
    ]);

    const runByJob = new Map(runs.map((run) => [run.job, run]));

    const jobs: AdminStatusJob[] = JOB_REGISTRY.map((def) => {
      const run = runByJob.get(def.job);
      const lastFinishedAt = run?.lastFinishedAt ?? null;
      const lastStatus = (run?.lastStatus as JobRunStatus | undefined) ?? null;
      const alertAfterHours = this.resolveAlertAfterHours(def, ldapAlertAfterHours);
      const late = isJobLate({
        lastFinishedAt,
        lastStatus,
        thresholdMs: alertAfterHours * HOUR_MS,
        now,
        processStartedAt,
      });

      return {
        job: def.job,
        label: def.label,
        schedule: def.schedule,
        lastStartedAt: run?.lastStartedAt?.toISOString() ?? null,
        lastFinishedAt: lastFinishedAt?.toISOString() ?? null,
        lastStatus,
        lastError: run?.lastError ?? null,
        lastDurationMs: run?.lastDurationMs ?? null,
        late,
      };
    });

    return {
      version: process.env.APP_VERSION || 'dev',
      commit: process.env.APP_COMMIT || 'dev',
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      jobs,
    };
  }

  /**
   * La synchro LDAP peut être espacée au-delà des 6 h nominales par
   * ldap.sync_interval_hours (admin UI) : ces passages différés sont
   * volontaires (cf. ldap.service.ts scheduledSync — ils ne sont même pas
   * enregistrés comme "skipped"), donc le seuil "en retard" doit suivre ce
   * même intervalle configuré plutôt que le repli statique du registre.
   */
  private resolveAlertAfterHours(def: JobDefinition, ldapAlertAfterHours: number): number {
    return def.job === JOB_KEYS.LDAP_SYNC ? ldapAlertAfterHours : def.alertAfterHours;
  }

  /** 2 × l'intervalle réel entre deux passages : l'intervalle configuré, mais
   *  jamais moins que les 6 h du planificateur (un intervalle de 1 h ne fait
   *  pas passer la synchronisation plus souvent, il ne doit donc pas la
   *  déclarer en retard au bout de 2 h). */
  private async resolveLdapSyncAlertAfterHours(): Promise<number> {
    const intervalHours = await this.settings.getInt('ldap.sync_interval_hours');
    return Math.max(intervalHours, LDAP_SYNC_CRON_HOURS) * 2;
  }
}
