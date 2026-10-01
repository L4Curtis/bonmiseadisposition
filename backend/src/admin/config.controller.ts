import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { ConfigRegistryService } from '../config/config-registry.service';
import { toFullListResponse } from '../common/pagination';
import { clientIp } from '../common/http/client-ip';
import { CONNECTION_TEST_THROTTLE } from '../common/throttle-limits';
import { LdapService } from '../ldap/ldap.service';
import { SmbService } from '../smb/smb.service';
import type { ConfigRegistryResponse } from '../contracts/config-registry';
import type {
  ConfigHealthResponse,
  ConfigUpdateResponse,
  ConnectionTestResponse,
} from '../contracts/admin';
import { ConfigSettingsService } from './config-settings.service';
import { ConnectionTestsService } from './connection-tests.service';
import { SmtpTestDto } from './dto/smtp-test.dto';

/**
 * Écran Configuration : état des rubriques, registre des réglages (valeur
 * saisie, par défaut, appliquée), lecture et enregistrement d'une rubrique,
 * tests de connexion. Réservé à l'administrateur.
 *
 * Les routes statiques (`health`, `registry`, `test/…`) sont déclarées avant
 * `:category`, qui les capturerait sinon.
 */
@Controller('admin/config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ConfigController {
  constructor(
    private readonly settingsService: ConfigSettingsService,
    private readonly registry: ConfigRegistryService,
    private readonly connectionTests: ConnectionTestsService,
    private readonly ldapService: LdapService,
    private readonly smbService: SmbService,
  ) {}

  /** GET /admin/config/health — état de chaque rubrique (configurée, incomplète…), sans secret. */
  @Get('health')
  getHealth(): Promise<ConfigHealthResponse> {
    return this.settingsService.getHealth();
  }

  /** GET /admin/config/registry — pour chaque réglage : saisi, par défaut, appliqué (secrets masqués). */
  @Get('registry')
  async getRegistry(): Promise<ConfigRegistryResponse> {
    return toFullListResponse(await this.registry.describe());
  }

  /** Tests de connexion : 200 `{ ok, message }`, y compris quand le test échoue.
   *  Chacun joint un serveur externe : débit limité (CONNECTION_TEST_THROTTLE). */
  @Post('test/ldap')
  @HttpCode(HttpStatus.OK)
  @Throttle(CONNECTION_TEST_THROTTLE)
  testLdap(): Promise<ConnectionTestResponse> {
    return this.ldapService.testConnection();
  }

  @Post('test/smtp')
  @HttpCode(HttpStatus.OK)
  @Throttle(CONNECTION_TEST_THROTTLE)
  testSmtp(@Body() body: SmtpTestDto): Promise<ConnectionTestResponse> {
    return this.connectionTests.testSmtp(body.testEmail || undefined);
  }

  @Post('test/entra')
  @HttpCode(HttpStatus.OK)
  @Throttle(CONNECTION_TEST_THROTTLE)
  testEntra(): Promise<ConnectionTestResponse> {
    return this.connectionTests.testEntra();
  }

  @Post('test/smb')
  @HttpCode(HttpStatus.OK)
  @Throttle(CONNECTION_TEST_THROTTLE)
  testSmb(): Promise<ConnectionTestResponse> {
    return this.smbService.testConnection();
  }

  /** GET /admin/config/:category — valeurs saisies de la rubrique, secrets masqués. */
  @Get(':category')
  getSection(@Param('category') category: string): Promise<Record<string, string | null>> {
    return this.settingsService.getSection(category);
  }

  /** PUT /admin/config/:category — enregistre la rubrique et trace les changements au journal. */
  @Put(':category')
  async setSection(
    @Param('category') category: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<ConfigUpdateResponse> {
    await this.settingsService.update(category, body ?? {}, {
      id: user.id,
      ip: clientIp(req),
      userAgent: req.get('user-agent') ?? null,
    });
    return { ok: true };
  }
}
