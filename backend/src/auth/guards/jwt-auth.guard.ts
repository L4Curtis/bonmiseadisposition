import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Routes accessible even when mustChangePassword is true
const MUST_CHANGE_EXEMPTIONS = [
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/refresh',
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    if (user.mustChangePassword) {
      const request = context.switchToHttp().getRequest();
      const isExempted = MUST_CHANGE_EXEMPTIONS.some((p) => request.path.startsWith(p));
      if (!isExempted) {
        throw new ForbiddenException('Vous devez changer votre mot de passe avant de continuer');
      }
    }
    return user;
  }
}
