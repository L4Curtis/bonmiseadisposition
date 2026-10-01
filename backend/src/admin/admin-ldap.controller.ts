import { Controller, Get, HttpCode, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { clientIp } from '../common/http/client-ip';
import { HEAVY_OPERATION_THROTTLE } from '../common/throttle-limits';
import { LdapService } from '../ldap/ldap.service';
import type { LdapDeactivateAllResponse, LdapSyncStatusResponse, LdapSyncTriggerResponse } from '../contracts/admin';
import { LdapAdminService } from './ldap-admin.service';

/**
 * Synchronisation de l'annuaire (Active Directory) : état de la dernière
 * synchronisation, lancement manuel, désactivation en masse des comptes de
 * l'annuaire. Réservé à l'administrateur.
 */
@Controller('admin/ldap')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminLdapController {
  private readonly logger = new Logger(AdminLdapController.name);

  constructor(
    private readonly ldapService: LdapService,
    private readonly ldapAdminService: LdapAdminService,
  ) {}

  /** GET /admin/ldap/status — résultat de la dernière synchronisation (tenu en mémoire). */
  @Get('status')
  getStatus(): LdapSyncStatusResponse {
    const status = this.ldapService.getSyncStatus();
    return { ...status, lastSync: status.lastSync?.toISOString() ?? null };
  }

  /** POST /admin/ldap/sync — lance la synchronisation en arrière-plan ; son
   *  résultat se lit ensuite sur /admin/ldap/status. */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Throttle(HEAVY_OPERATION_THROTTLE)
  triggerSync(): LdapSyncTriggerResponse {
    this.ldapService.syncUsers().catch((err: unknown) => {
      this.logger.error(
        `Synchronisation de l'annuaire (lancée à la main) en échec : ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return { ok: true, message: "Synchronisation de l'annuaire lancée." };
  }

  /** POST /admin/ldap/deactivate-all — désactive (sans jamais supprimer) les
   *  comptes collaborateurs venus de l'annuaire. */
  @Post('deactivate-all')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('DELETE /admin/ldap/users')
  @Throttle(HEAVY_OPERATION_THROTTLE)
  async deactivateAll(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<LdapDeactivateAllResponse> {
    const { deactivated } = await this.ldapAdminService.deactivateAll(user.id, clientIp(req));
    const message =
      deactivated === 0
        ? "Aucun compte de l'annuaire à désactiver."
        : `${deactivated} compte${deactivated > 1 ? 's' : ''} de l'annuaire désactivé${deactivated > 1 ? 's' : ''}.`;
    return { ok: true, message, deactivated };
  }
}
