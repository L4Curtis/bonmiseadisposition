import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NotificationFailuresService } from './notification-failures.service';
import { SsoDiagnosticService } from './sso-diagnostic.service';
import { FailedNotificationsQueryDto, SsoDiagnosticQueryDto } from './dto/admin-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MonitoringService } from '../monitoring/monitoring.service';
import { toFullListResponse } from '../common/pagination';
import type { AdminStatusResponse, FailedNotificationsResponse, SsoDiagnosticResponse } from '../contracts/admin';

/**
 * Supervision de l'application : état des tâches planifiées, emails en échec,
 * diagnostic des connexions Microsoft (SSO). Les autres routes `/admin` sont
 * rangées par sujet : configuration (`config.controller.ts`), annuaire
 * (`admin-ldap.controller.ts`), copie réseau des PDF (`admin-smb.controller.ts`),
 * rétention (`retention/`). Tout est réservé à l'administrateur.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly notificationFailuresService: NotificationFailuresService,
    private readonly ssoDiagnosticService: SsoDiagnosticService,
    private readonly monitoringService: MonitoringService,
  ) {}

  /** GET /admin/notifications/failed?days= — emails en échec (30 derniers jours par défaut). */
  @Get('notifications/failed')
  getFailedNotifications(@Query() query: FailedNotificationsQueryDto): Promise<FailedNotificationsResponse> {
    return this.notificationFailuresService.getFailedNotifications(query.days);
  }

  /** GET /admin/status — version déployée, base joignable, dernier passage de chaque tâche planifiée. */
  @Get('status')
  getStatus(): Promise<AdminStatusResponse> {
    return this.monitoringService.getAdminStatus();
  }

  /** GET /admin/sso/diagnostic?limit= — dernières connexions SSO et rôle attribué :
   *  rend visible « la personne est dans le groupe Entra mais n'obtient pas son rôle ». */
  @Get('sso/diagnostic')
  async getSsoDiagnostic(@Query() query: SsoDiagnosticQueryDto): Promise<SsoDiagnosticResponse> {
    return toFullListResponse(await this.ssoDiagnosticService.getRecent(query.limit));
  }
}
