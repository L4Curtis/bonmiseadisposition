import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContestationService } from './contestation.service';
import { parsePositiveInt } from '../common/query-utils';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ALL_ROLES, Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { CreateContestationDto, ResolveContestationDto } from './dto/contestation.dto';
import { parseContestationStatusFilter } from './contestation-queries';

/**
 * Contestations. Les routes de l'équipe informatique vivent sous
 * `/contestations` ; la création garde son adresse historique
 * `/bons/:id/contestation`, ouverte à tout rôle connecté (chacun peut recevoir
 * du matériel) : le service refuse tout autre compte que le titulaire du bon,
 * IT compris.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class ContestationController {
  constructor(private readonly contestationService: ContestationService) {}

  /** POST /api/bons/:id/contestation — le titulaire conteste un document.
   *  Débit limité : chaque contestation envoie une alerte à toute l'équipe
   *  informatique. */
  @Post('bons/:id/contestation')
  @Roles(...ALL_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  create(@Param('id') id: string, @Body() dto: CreateContestationDto, @CurrentUser() user: AuthUser) {
    return this.contestationService.create(id, user.id, dto.message, dto.document);
  }

  /** GET /api/contestations/mine — ses propres contestations et leur suivi. */
  @Get('contestations/mine')
  @Roles(...ALL_ROLES)
  findMine(@CurrentUser() user: AuthUser) {
    return this.contestationService.findMine(user.id);
  }

  /** GET /api/contestations — liste paginée pour l'équipe informatique.
   *  `aTraiter=1` : les contestations à traiter, avec le prédicat de la tuile
   *  de l'accueil (même nombre de lignes que son chiffre). */
  @Get('contestations')
  findAll(
    @Query('status') status?: string,
    @Query('aTraiter') toProcess?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contestationService.findAll({
      statuses: parseContestationStatusFilter(status),
      toProcess: toProcess === '1' || toProcess === 'true',
      page: parsePositiveInt(page, 1),
      limit: parsePositiveInt(limit, 20, 100),
    });
  }

  /** PATCH /api/contestations/:id/review — prise en charge. */
  @Patch('contestations/:id/review')
  markInReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.contestationService.markInReview(id, user.id);
  }

  /** PATCH /api/contestations/:id/resolve — décision : Fondée ou Non retenue. */
  @Patch('contestations/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveContestationDto, @CurrentUser() user: AuthUser) {
    return this.contestationService.resolve(id, user.id, dto.outcome, dto.resolutionMessage);
  }
}
