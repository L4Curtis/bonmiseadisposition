import { Injectable, Optional, Inject, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard, AuthModuleOptions } from '@nestjs/passport';
import { AuthUser } from '../auth-user.interface';

// Routes accessible even when mustChangePassword is true
const MUST_CHANGE_EXEMPTIONS = [
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/refresh',
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Depuis NestJS 11/12, le paramètre @Optional() du constructeur du mixin
  // AuthGuard() (@nestjs/passport) n'est plus hérité automatiquement par une
  // sous-classe sans constructeur propre : Nest le traite alors comme une
  // dépendance obligatoire. Or AuthModule importe PassportModule sans
  // .register(), donc AuthModuleOptions n'est fourni nulle part — sans ce
  // constructeur explicite, l'application entière échoue à démarrer (pas
  // seulement les tests qui composent un graphe de modules restreint, cf.
  // modules-boot.spec.ts). On redéclare le constructeur pour restaurer le
  // caractère optionnel.
  constructor(@Optional() @Inject(AuthModuleOptions) options?: AuthModuleOptions) {
    super(options);
  }

  handleRequest<TUser = AuthUser>(err: Error | null, user: TUser | false, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    const authUser = user as unknown as AuthUser;
    if (authUser.mustChangePassword) {
      const request = context.switchToHttp().getRequest();
      const isExempted = MUST_CHANGE_EXEMPTIONS.some((p) => request.path.startsWith(p));
      if (!isExempted) {
        throw new ForbiddenException('Vous devez changer votre mot de passe avant de continuer');
      }
    }
    return user;
  }
}
