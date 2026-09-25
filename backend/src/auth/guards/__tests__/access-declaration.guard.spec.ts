/**
 * AccessDeclarationGuard — filet d'exécution du refus par défaut.
 *
 * Les contrôleurs de sonde portent de VRAIES métadonnées (@Roles, @Public,
 * @UseGuards) et sont servis par une vraie application Nest, avec le garde
 * enregistré globalement comme dans AuthModule (APP_GUARD) : on vérifie le
 * code HTTP réellement renvoyé au navigateur.
 */
import {
  CanActivate, Controller, ExecutionContext, Get, INestApplication, Injectable, Module, UseGuards,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AccessDeclarationGuard, accessDeclarationFault } from '../access-declaration.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RolesGuard } from '../roles.guard';
import { Roles, ALL_ROLES } from '../../decorators/roles.decorator';
import { Public } from '../../decorators/public.decorator';
import { AuthModule } from '../../auth.module';
import { FilialeStampRedactionInterceptor } from '../../interceptors/filiale-stamp-redaction.interceptor';
import { AuthUser } from '../../auth-user.interface';

/** Contrôleur oublié : ni garde, ni déclaration. Sans le filet, ouvert à tous. */
@Controller('sonde/oubliee')
class OublieeController {
  @Get()
  route() { return { ok: true }; }
}

/** Rôles déclarés, mais aucune garde pour les appliquer. */
@Controller('sonde/sans-gardes')
@Roles('admin')
class SansGardesController {
  @Get()
  route() { return { ok: true }; }
}

/** Gardes dans le mauvais ordre : RolesGuard ne verrait jamais l'utilisateur. */
@Controller('sonde/ordre-inverse')
@UseGuards(RolesGuard, JwtAuthGuard)
@Roles('admin')
class OrdreInverseController {
  @Get()
  route() { return { ok: true }; }
}

@Controller('sonde/publique')
@Public()
class PubliqueController {
  @Get()
  route() { return { ok: true }; }
}

@Controller('sonde/protegee')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_ROLES)
class ProtegeeController {
  @Get()
  route() { return { ok: true }; }

  // Une méthode peut ajouter ses propres gardes : la classe fournit déjà
  // JwtAuthGuard puis RolesGuard, dans l'ordre.
  @Get('admin')
  @Roles('admin')
  admin() { return { ok: true }; }
}

describe('accessDeclarationFault — lecture des métadonnées réelles', () => {
  const reflector = new Reflector();
  const fault = (controller: new () => object, method = 'route'): string | null =>
    accessDeclarationFault(reflector, (controller.prototype as Record<string, () => unknown>)[method], controller);

  it('signale une route sans @Public ni @Roles', () => {
    expect(fault(OublieeController)).toBe('ni @Public() ni @Roles()');
  });

  it('signale des rôles sans JwtAuthGuard puis RolesGuard', () => {
    expect(fault(SansGardesController)).toBe('@Roles() sans @UseGuards(JwtAuthGuard, RolesGuard)');
    expect(fault(OrdreInverseController)).toBe('@Roles() sans @UseGuards(JwtAuthGuard, RolesGuard)');
  });

  it('accepte une route publique et une route protégée dans les règles', () => {
    expect(fault(PubliqueController)).toBeNull();
    expect(fault(ProtegeeController)).toBeNull();
    expect(fault(ProtegeeController, 'admin')).toBeNull();
  });
});

/** Remplace JwtAuthGuard : l'en-tête `x-test-role` simule la session. */
@Injectable()
class FakeJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: Partial<AuthUser> }>();
    const role = req.headers['x-test-role'];
    if (role) req.user = { id: 'u-1', role: role as AuthUser['role'] };
    return Boolean(role);
  }
}

@Module({
  controllers: [
    OublieeController, SansGardesController, OrdreInverseController, PubliqueController, ProtegeeController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessDeclarationGuard }],
})
class SondeModule {}

describe('AccessDeclarationGuard — réponse HTTP réelle (garde global)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SondeModule] })
      .overrideGuard(JwtAuthGuard).useClass(FakeJwtAuthGuard)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const statut = async (path: string, role?: string): Promise<number> =>
    (await fetch(`${baseUrl}${path}`, { headers: role ? { 'x-test-role': role } : {} })).status;

  it('refuse (403) un contrôleur oublié, même sans session et même pour un administrateur', async () => {
    expect(await statut('/sonde/oubliee')).toBe(403);
    expect(await statut('/sonde/oubliee', 'admin')).toBe(403);
  });

  it('refuse (403) des rôles déclarés sans les gardes qui les appliquent', async () => {
    expect(await statut('/sonde/sans-gardes')).toBe(403);
    expect(await statut('/sonde/ordre-inverse', 'admin')).toBe(403);
  });

  it('laisse passer une route publique et une route protégée dans les règles', async () => {
    expect(await statut('/sonde/publique')).toBe(200);
    expect(await statut('/sonde/protegee', 'collaborator')).toBe(200);
    expect(await statut('/sonde/protegee/admin', 'admin')).toBe(200);
    expect(await statut('/sonde/protegee/admin', 'technician')).toBe(403);
  });
});

describe('AuthModule — enregistrement global', () => {
  const providers = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[]) ?? [];
  const global = (token: string, useClass: unknown): boolean =>
    providers.some((p) => typeof p === 'object' && p !== null
      && (p as { provide?: unknown }).provide === token && (p as { useClass?: unknown }).useClass === useClass);

  it('enregistre le filet de refus par défaut et l’expurgation du cachet pour toute l’application', () => {
    expect(global(APP_GUARD, AccessDeclarationGuard)).toBe(true);
    expect(global(APP_INTERCEPTOR, FilialeStampRedactionInterceptor)).toBe(true);
  });
});
