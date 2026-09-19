import { Global, Module } from '@nestjs/common';
import { JobTrackerService } from './job-tracker.service';
import { MonitoringService } from './monitoring.service';

/**
 * Global comme PrismaModule/ConfigModule : JobTrackerService est consommé
 * par des services de modules par ailleurs indépendants (ldap, notification,
 * retention, smb) sans lien de dépendance entre eux — les rendre globaux
 * évite d'ajouter cet import croisé dans chacun de ces modules.
 */
@Global()
@Module({
  providers: [JobTrackerService, MonitoringService],
  exports: [JobTrackerService, MonitoringService],
})
export class MonitoringModule {}
