import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../auth-user.interface';

export const INSUFFICIENT_RIGHTS_MESSAGE = 'Droits insuffisants pour cette action';

/**
 * Contrôle des rôles, avec REFUS PAR DÉFAUT :
 *  1. la route (ou sa classe) porte `@Roles(...)` → seuls ces rôles passent ;
 *  2. sinon, elle porte `@Public()` → elle passe sans condition ;
 *  3. sinon, elle est refusée : une route oubliée reste fermée au lieu d'être
 *     ouverte à tout compte connecté.
 * `@Roles` est lu avant `@Public` : une déclaration contradictoire se ferme.
 *
 * S'utilise après JwtAuthGuard (`@UseGuards(JwtAuthGuard, RolesGuard)`), qui
 * attache l'utilisateur à la requête.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);

    if (!requiredRoles || requiredRoles.length === 0) {
      if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) return true;
      this.logger.warn(
        `Route refusée faute de déclaration d'accès (@Roles ou @Public) : ` +
        `${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenException(INSUFFICIENT_RIGHTS_MESSAGE);
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(INSUFFICIENT_RIGHTS_MESSAGE);
    }
    return true;
  }
}
