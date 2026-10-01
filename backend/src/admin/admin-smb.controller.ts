import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppException } from '../common/errors';
import { toFullListResponse } from '../common/pagination';
import { HEAVY_OPERATION_THROTTLE } from '../common/throttle-limits';
import { ConfigRegistryService } from '../config/config-registry.service';
import { SmbService } from '../smb/smb.service';
import type {
  SmbFailedExportsResponse,
  SmbRetryAllResponse,
  SmbRetryOneResponse,
  SmbStatusResponse,
} from '../contracts/admin';

/**
 * Surveillance de la copie des PDF sur le partage réseau (export SMB) :
 * compteurs, exports en échec, relances. Réservé à l'administrateur.
 */
@Controller('admin/smb')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminSmbController {
  constructor(
    private readonly smbService: SmbService,
    private readonly settings: ConfigRegistryService,
  ) {}

  @Get('status')
  async getStatus(): Promise<SmbStatusResponse> {
    const status = await this.smbService.getStatus();
    if (!status.enabled) return { enabled: false };
    return { ...status, lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null };
  }

  /** GET /admin/smb/failed — les 100 exports en échec les plus récents (liste vide si la copie est désactivée). */
  @Get('failed')
  async getFailed(): Promise<SmbFailedExportsResponse> {
    const exports = await this.smbService.getFailedExports();
    return toFullListResponse(
      exports.map((e) => ({
        ...e,
        lastAttemptAt: e.lastAttemptAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    );
  }

  /** POST /admin/smb/retry/:id — relance un export : 200 `{ ok, message }`,
   *  `ok` faux quand la relance a échoué (le message dit pourquoi). */
  @Post('retry/:id')
  @HttpCode(HttpStatus.OK)
  async retryOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<SmbRetryOneResponse> {
    await this.assertEnabled();
    return this.smbService.retryOne(id);
  }

  /** POST /admin/smb/retry-all — relance les exports en échec (moins de 3 tentatives, 50 au plus) ; débit limité. */
  @Post('retry-all')
  @HttpCode(HttpStatus.OK)
  @Throttle(HEAVY_OPERATION_THROTTLE)
  async retryAll(): Promise<SmbRetryAllResponse> {
    await this.assertEnabled();
    return this.smbService.retryAllFailed();
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.settings.getBool('smb.enabled'))) {
      throw new AppException('smb_disabled', "La copie des PDF sur le partage réseau n'est pas activée.");
    }
  }
}
