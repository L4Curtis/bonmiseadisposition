import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { AuthUser } from '../../auth-user.interface';

describe('RolesGuard', () => {
  function makeGuard(requiredRoles: string[] | undefined): RolesGuard {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  function makeContext(user?: Partial<AuthUser>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('laisse passer une route sans métadonnée @Roles', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext({ role: 'collaborator' } as AuthUser))).toBe(true);
  });

  it('accepte un utilisateur direction sur une route qui liste direction (/kpi, /reporting/inventory)', () => {
    const guard = makeGuard(['admin', 'technician', 'direction']);
    expect(guard.canActivate(makeContext({ role: 'direction' } as AuthUser))).toBe(true);
  });

  it('refuse un utilisateur direction sur une route IT-only (/bons, /admin)', () => {
    const guard = makeGuard(['admin', 'technician']);
    expect(() => guard.canActivate(makeContext({ role: 'direction' } as AuthUser))).toThrow(ForbiddenException);
  });

  it('refuse un collaborateur sur une route direction+IT', () => {
    const guard = makeGuard(['admin', 'technician', 'direction']);
    expect(() => guard.canActivate(makeContext({ role: 'collaborator' } as AuthUser))).toThrow(ForbiddenException);
  });

  it('refuse sans utilisateur authentifié', () => {
    const guard = makeGuard(['admin']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
