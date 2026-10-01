import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContestationService } from './contestation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ALL_ROLES, Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { CreateContestationDto, ResolveContestationDto } from './dto/contestation.dto';
import { QueryContestationsDto } from './dto/query-contestations.dto';

/**
 * Contestations. Les routes de l'équipe informatique vivent sous
 * `/contestations` ; celles de la personne connectée sous `/me`. La création
 * garde son adresse `/bons/:id/contestation`, ouverte à tout rôle connecté
 * (chacun peut recevoir du matériel) : le service refuse tout autre compte que
 * le titulaire du bon, IT compris.
 *
 * Prise en charge et décision sont des actions métier : `POST
 * /contestations/:id/<action>` (l'ancien verbe PATCH reste servi en alias).
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

  /** GET /api/me/contestations — ses propres contestations et leur suivi. */
  @Get('me/contestations')
  @Roles(...ALL_ROLES)
  @DeprecatedAlias('GET /contestations/mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.contestationService.findMine(user.id);
  }

  /** GET /api/contestations — liste paginée pour l'équipe informatique, à la
   *  forme commune des listes ; compteurs de l'en-tête dans `meta`. */
  @Get('contestations')
  findAll(@Query() query: QueryContestationsDto) {
    return this.contestationService.findAll({
      statuses: query.status?.length ? query.status : undefined,
      toProcess: query.aTraiter === true,
      page: query.page,
      limit: query.limit,
    });
  }

  /** POST /api/contestations/:id/review — prise en charge. */
  @Post('contestations/:id/review')
  @DeprecatedAlias('PATCH /contestations/:id/review')
  markInReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.contestationService.markInReview(id, user.id);
  }

  /** POST /api/contestations/:id/resolve — décision : Fondée ou Non retenue. */
  @Post('contestations/:id/resolve')
  @DeprecatedAlias('PATCH /contestations/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveContestationDto, @CurrentUser() user: AuthUser) {
    return this.contestationService.resolve(id, user.id, dto.outcome, dto.resolutionMessage);
  }
}
