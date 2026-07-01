import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@Controller('admin/retention')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /** Aperçu : nombre de bons éligibles à l'anonymisation, sans rien modifier. */
  @Get('preview')
  preview() {
    return this.retention.preview();
  }

  /** Déclenche l'anonymisation. { dryRun: true } pour simuler. */
  @Post('run')
  run(@Body('dryRun') dryRun: boolean | undefined, @CurrentUser() user: AuthUser) {
    return this.retention.run(dryRun === true, user?.email);
  }

  /** Statistiques de rétention technique (tokens expirés, vieux logs d'audit). */
  @Get('stats')
  getStats() {
    return this.retention.getRetentionStats();
  }

  /** Déclenche la purge technique (tokens de signature expirés + vieux logs d'audit). */
  @Post('purge')
  async purge() {
    const results = await this.retention.purgeTechnical();
    return { ok: true, ...results };
  }
}
