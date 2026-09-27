import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { NotificationService } from '../../notification/notification.service';
import { JobTrackerService } from '../../monitoring/job-tracker.service';
import { TemplatesService } from '../../templates/templates.service';
import { JOB_KEYS } from '../../monitoring/job-registry';
import { OverdueAlertOutcome, runContestationOverdueAlerts } from './run-overdue-alerts';

/**
 * Tâche planifiée « Relance des contestations non traitées » : les jours
 * ouvrés à 9 h (heure de Paris), comme les rappels de signature. Suivie dans
 * la supervision (ScheduledJobRun) comme les autres tâches.
 */
@Injectable()
export class ContestationOverdueService {
  private readonly logger = new Logger(ContestationOverdueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
    private readonly notificationService: NotificationService,
    private readonly jobTracker: JobTrackerService,
    private readonly templatesService: TemplatesService,
  ) {}

  @Cron('0 9 * * 1-5', { name: 'contestation-overdue-alert', timeZone: 'Europe/Paris' })
  async handleCron(): Promise<void> {
    try {
      await this.jobTracker.track<OverdueAlertOutcome>(JOB_KEYS.CONTESTATION_OVERDUE, () => this.run());
    } catch (err: unknown) {
      // Une panne de la relance ne doit pas faire tomber le planificateur :
      // elle est tracée dans la supervision (track) et ici.
      this.logger.error(`Relance des contestations en échec : ${err instanceof Error ? err.stack : String(err)}`);
    }
  }

  /** Un passage, déclenchable à la main (tests, recette). */
  run(now: Date = new Date()): Promise<OverdueAlertOutcome> {
    return runContestationOverdueAlerts(
      {
        prisma: this.prisma,
        configService: this.configService,
        notificationService: this.notificationService,
        templatesService: this.templatesService,
        logger: this.logger,
      },
      now,
    );
  }
}
