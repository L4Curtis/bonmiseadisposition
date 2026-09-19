import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { JOB_KEYS, JOB_REGISTRY, JobDefinition } from './job-registry';
import { isJobLate, JobRunStatus } from './job-late.util';
import { checkDatabase } from './database-check.util';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_LDAP_SYNC_INTERVAL_HOURS = 6;

export interface AdminStatusJob {
  job: string;
  label: string;
  schedule: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: JobRunStatus | null;
  lastError: string | null;
  lastDurationMs: number | null;
  late: boolean;
}

export interface AdminStatus {
  version: string;
  commit: string;
  uptimeSeconds: number;
  database: 'ok' | 'unreachable';
  jobs: AdminStatusJob[];
}

/** Agrège les informations affichées par GET /api/admin/status (lot A5,
 *  supervision) : version/commit déployés, disponibilité de la base, dernier
 *  passage de chaque tâche planifiée. */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
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

  /** 2 × l'intervalle configuré (défaut/repli 6 h si absent ou invalide). */
  private async resolveLdapSyncAlertAfterHours(): Promise<number> {
    const raw = await this.configService.get('ldap', 'sync_interval_hours');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    const intervalHours = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LDAP_SYNC_INTERVAL_HOURS;
    return intervalHours * 2;
  }
}
