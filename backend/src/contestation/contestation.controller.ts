import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContestationService } from './contestation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { ResolveContestationDto } from './dto/resolve-contestation.dto';

@Controller('contestations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContestationController {
  constructor(private readonly contestationService: ContestationService) {}

  // ─── Collaborateur : créer une contestation via /bons/:id/contestation ───────
  // Note : cette route est montée sur /api/bons/:id/contestation dans BonsController
  // Ici on expose /api/contestations pour l'IT

  /** GET /api/contestations — liste paginée pour IT/admin */
  @Get()
  @Roles('admin', 'technician')
  findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contestationService.findAll({
      status,
      page: page ? parseInt(page) : 1,
      limit: Math.min(limit ? parseInt(limit) : 20, 100),
    });
  }

  /** PATCH /api/contestations/:id/review — prise en charge */
  @Patch(':id/review')
  @Roles('admin', 'technician')
  markInReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.contestationService.markInReview(id, user.id);
  }

  /** PATCH /api/contestations/:id/resolve — résolution ou rejet */
  @Patch(':id/resolve')
  @Roles('admin', 'technician')
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveContestationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contestationService.resolve(id, user.id, body.action, body.resolutionMessage);
  }
}
