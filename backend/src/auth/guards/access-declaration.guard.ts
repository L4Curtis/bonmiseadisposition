import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { INSUFFICIENT_RIGHTS_MESSAGE, RolesGuard } from './roles.guard';

/** Méthode ou classe de contrôleur, comme les attend `Reflector` de Nest. */
type Target = Type | Function;

function declaredGuards(target: Target): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];
}

function isGuard(entry: unknown, guard: Type): boolean {
  return entry === guard || entry instanceof guard;
}

/**
 * Pourquoi une route serait TROP OUVERTE, ou `null` si sa déclaration d'accès
 * est complète : `@Public()`, ou bien des rôles derrière JwtAuthGuard PUIS
 * RolesGuard (sans ces deux gardes, un `@Roles` ne protège rien).
 */
export function accessDeclarationFault(reflector: Reflector, handler: Target, controller: Type): string | null {
  const targets = [handler, controller];
  const roles = reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets) ?? [];
  const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true;

  if (roles.length === 0) return isPublic ? null : 'ni @Public() ni @Roles()';

  const guards = [...declaredGuards(controller), ...declaredGuards(handler)];
  const jwt = guards.findIndex((g) => isGuard(g, JwtAuthGuard));
  const rolesGuard = guards.findIndex((g) => isGuard(g, RolesGuard));
  if (jwt === -1 || rolesGuard === -1 || jwt > rolesGuard) {
    return '@Roles() sans @UseGuards(JwtAuthGuard, RolesGuard)';
  }
  return null;
}

/**
 * Filet d'exécution du refus par défaut, enregistré globalement par AuthModule.
 *
 * RolesGuard ne protège que les contrôleurs qui le déclarent : un contrôleur
 * sans gardes serait ouvert à tous, même sans session. Ce garde global refuse
 * donc toute route dont la déclaration d'accès est incomplète, AVANT les gardes
 * du contrôleur. Il ne lit que des métadonnées (verdict mémorisé par route) :
 * il ne remplace ni JwtAuthGuard ni RolesGuard, qui restent sur chaque
 * contrôleur. Le test d'inventaire (auth/__tests__/route-access.spec.ts)
 * garantit qu'aucune route livrée n'est concernée : ce filet ne sert que si ce
 * test n'a pas été exécuté.
 */
@Injectable()
export class AccessDeclarationGuard implements CanActivate {
  private readonly logger = new Logger(AccessDeclarationGuard.name);
  private readonly verdicts = new WeakMap<object, string | null>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    let fault = this.verdicts.get(handler);
    if (fault === undefined) {
      fault = accessDeclarationFault(this.reflector, handler, controller);
      this.verdicts.set(handler, fault);
    }
    if (fault === null) return true;

    this.logger.error(`Route refusée, déclaration d'accès incomplète (${fault}) : ${controller.name}.${handler.name}`);
    throw new ForbiddenException(INSUFFICIENT_RIGHTS_MESSAGE);
  }
}
