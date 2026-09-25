/**
 * RolesGuard — refus par défaut.
 *
 * Les tests lisent les VRAIES métadonnées posées par @Roles / @Public sur des
 * classes décorées (Reflector réel, pas de doublure) : c'est la lecture de ces
 * métadonnées qui décide de l'accès en production. Le dernier bloc démarre une
 * vraie application Nest et l'interroge en HTTP pour vérifier le code de
 * statut et le message renvoyés au navigateur.
 */
import {
  CanActivate, Controller, ExecutionContext, ForbiddenException, Get, INestApplication, Injectable, UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { RolesGuard, INSUFFICIENT_RIGHTS_MESSAGE } from '../roles.guard';
import { Roles, ALL_ROLES } from '../../decorators/roles.decorator';
import { Public } from '../../decorators/public.decorator';
import { AuthUser } from '../../auth-user.interface';

class SansDeclaration {
  route() { return 'ok'; }
}

@Roles('admin', 'technician')
class ClasseIt {
  heritee() { return 'ok'; }

  @Roles('admin')
  adminSeulement() { return 'ok'; }

  @Roles(...ALL_ROLES)
  tousLesRoles() { return 'ok'; }
}

@Public()
class ClassePublique {
  route() { return 'ok'; }
}

class Mixte {
  @Public()
  publique() { return 'ok'; }

  // Déclaration contradictoire : le rôle l'emporte (refus plutôt qu'ouverture).
  @Public()
  @Roles('admin')
  contradictoire() { return 'ok'; }
}

function contexte(cls: new () => object, method: string, user?: Partial<AuthUser>): ExecutionContext {
  const handler = (cls.prototype as Record<string, () => unknown>)[method];
  return new ExecutionContextHost([{ user }, {}], cls as never, handler);
}

describe('RolesGuard — lecture des métadonnées réelles', () => {
  const guard = new RolesGuard(new Reflector());

  it('refuse une route sans @Roles ni @Public, même pour un administrateur', () => {
    expect(() => guard.canActivate(contexte(SansDeclaration, 'route', { role: 'admin' }))).toThrow(ForbiddenException);
  });

  it('laisse passer une route @Public sans utilisateur connecté', () => {
    expect(guard.canActivate(contexte(Mixte, 'publique', undefined))).toBe(true);
  });

  it('applique @Public posé sur la classe à toutes ses méthodes', () => {
    expect(guard.canActivate(contexte(ClassePublique, 'route', undefined))).toBe(true);
  });

  it('applique les rôles de la classe à une méthode sans @Roles propre', () => {
    expect(guard.canActivate(contexte(ClasseIt, 'heritee', { role: 'technician' }))).toBe(true);
    expect(() => guard.canActivate(contexte(ClasseIt, 'heritee', { role: 'direction' }))).toThrow(ForbiddenException);
  });

  it('laisse le @Roles de la méthode remplacer celui de la classe', () => {
    expect(guard.canActivate(contexte(ClasseIt, 'adminSeulement', { role: 'admin' }))).toBe(true);
    expect(() => guard.canActivate(contexte(ClasseIt, 'adminSeulement', { role: 'technician' }))).toThrow(ForbiddenException);
  });

  it('ouvre une route @Roles(...ALL_ROLES) à chacun des quatre rôles', () => {
    for (const role of ['admin', 'technician', 'direction', 'collaborator'] as const) {
      expect(guard.canActivate(contexte(ClasseIt, 'tousLesRoles', { role }))).toBe(true);
    }
  });

  it('refuse une route protégée quand aucun utilisateur n\'est attaché à la requête', () => {
    expect(() => guard.canActivate(contexte(ClasseIt, 'heritee', undefined))).toThrow(ForbiddenException);
  });

  it('fait primer @Roles sur @Public quand les deux sont posés (déclaration contradictoire)', () => {
    expect(() => guard.canActivate(contexte(Mixte, 'contradictoire', undefined))).toThrow(ForbiddenException);
    expect(guard.canActivate(contexte(Mixte, 'contradictoire', { role: 'admin' }))).toBe(true);
  });

  it('répond en français, avec le même message pour un rôle insuffisant et une route non déclarée', () => {
    expect(() => guard.canActivate(contexte(ClasseIt, 'adminSeulement', { role: 'collaborator' })))
      .toThrow(INSUFFICIENT_RIGHTS_MESSAGE);
    expect(() => guard.canActivate(contexte(SansDeclaration, 'route', { role: 'admin' })))
      .toThrow(INSUFFICIENT_RIGHTS_MESSAGE);
    expect(INSUFFICIENT_RIGHTS_MESSAGE).toBe('Droits insuffisants pour cette action');
  });

  it('ALL_ROLES couvre exactement les rôles du schéma Prisma', async () => {
    const { UserRole } = await import('@prisma/client');
    expect([...ALL_ROLES].sort()).toEqual(Object.values(UserRole).sort());
  });
});

// ─── Bout en bout : vraie application Nest, vraie requête HTTP ───────────────

/** Remplace JwtAuthGuard : l'en-tête `x-test-role` simule l'utilisateur connecté. */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: Partial<AuthUser> }>();
    const role = req.headers['x-test-role'];
    if (role) req.user = { id: 'u-1', role: role as AuthUser['role'] };
    return true;
  }
}

@Controller('sonde')
@UseGuards(FakeAuthGuard, RolesGuard)
class SondeController {
  @Get('oubliee')
  oubliee() { return { ok: true }; }

  @Get('admin')
  @Roles('admin')
  admin() { return { ok: true }; }

  @Get('publique')
  @Public()
  publique() { return { ok: true }; }
}

describe('RolesGuard — réponse HTTP réelle', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [SondeController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function appel(path: string, role?: string): Promise<{ status: number; body: { message?: string } }> {
    const res = await fetch(`${baseUrl}${path}`, { headers: role ? { 'x-test-role': role } : {} });
    return { status: res.status, body: (await res.json()) as { message?: string } };
  }

  it('répond 403 en français sur une route oubliée (ni rôle ni @Public), même pour un admin', async () => {
    const { status, body } = await appel('/sonde/oubliee', 'admin');
    expect(status).toBe(403);
    expect(body.message).toBe('Droits insuffisants pour cette action');
  });

  it('répond 403 en français quand le rôle ne suffit pas', async () => {
    const { status, body } = await appel('/sonde/admin', 'technician');
    expect(status).toBe(403);
    expect(body.message).toBe('Droits insuffisants pour cette action');
  });

  it('répond 200 au bon rôle et sur une route @Public sans session', async () => {
    expect((await appel('/sonde/admin', 'admin')).status).toBe(200);
    expect((await appel('/sonde/publique')).status).toBe(200);
  });
});
