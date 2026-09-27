import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../auth-user.interface';
import { JwtAuthGuard } from '../jwt-auth.guard';

/**
 * Décision de la garde JWT une fois le jeton lu par Passport : session
 * absente → 401 ; mot de passe à changer → 403 partout, sauf sur les routes
 * qui permettent justement de le changer (ou de se déconnecter).
 */
function contextFor(path: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ path }) }) } as unknown as ExecutionContext;
}

const user = (mustChangePassword: boolean) => ({ id: 'u-1', role: 'technician', mustChangePassword }) as unknown as AuthUser;

describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard();

  it('laisse passer un compte authentifié', () => {
    const account = user(false);
    expect(guard.handleRequest(null, account, undefined, contextFor('/api/bons'))).toBe(account);
  });

  it('sans session : 401', () => {
    expect(() => guard.handleRequest(null, false, undefined, contextFor('/api/bons'))).toThrow(UnauthorizedException);
  });

  it('renvoie telle quelle l’erreur levée par la stratégie (jeton révoqué…)', () => {
    const revoked = new UnauthorizedException('Session révoquée');
    expect(() => guard.handleRequest(revoked, user(false), undefined, contextFor('/api/bons'))).toThrow(revoked);
  });

  it('mot de passe à changer : 403 sur toute autre route', () => {
    expect(() => guard.handleRequest(null, user(true), undefined, contextFor('/api/bons'))).toThrow(
      new ForbiddenException('Vous devez changer votre mot de passe avant de continuer'),
    );
  });

  it.each(['/api/auth/change-password', '/api/auth/logout', '/api/auth/me', '/api/auth/refresh'])(
    'mot de passe à changer : %s reste accessible',
    (path) => {
      const account = user(true);
      expect(guard.handleRequest(null, account, undefined, contextFor(path))).toBe(account);
    },
  );
});
