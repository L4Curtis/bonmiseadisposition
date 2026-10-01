import { Controller, Get, UseGuards } from '@nestjs/common';
import { BonsService } from './bons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, ALL_ROLES } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';

/**
 * Ce qui appartient à la personne connectée, quel que soit son rôle (chacun
 * peut recevoir du matériel) : ses bons. Ses contestations sont servies par
 * ContestationController (`GET /me/contestations`).
 */
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
export class MeController {
  constructor(private readonly bonsService: BonsService) {}

  /** GET /me/bons — « Mes équipements » : ses bons hors brouillons et
   *  annulés, vus comme par le titulaire. */
  @Get('bons')
  @DeprecatedAlias('GET /bons/mes-bons')
  myBons(@CurrentUser() user: AuthUser) {
    return this.bonsService.findByCollaborateur(user.id);
  }
}
