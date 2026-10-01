/**
 * Alias dépréciés : relevé des déclarations, puis service réel à travers une
 * application Nest configurée comme la production (configureApp).
 */
import { Controller, Get, INestApplication, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { configureApp } from '../../../bootstrap/configure-app';
import { collectDeprecatedAliases, DeprecatedAlias, deprecatedAliasMiddleware } from '../deprecated-alias';

class DenyGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller('items')
class ItemsController {
  @Get('history')
  @DeprecatedAlias('GET /items/serial-history', '/legacy/history')
  history(@Query('q') q: string) {
    return { route: 'history', q: q ?? null };
  }

  @Get('secret')
  @UseGuards(DenyGuard)
  @DeprecatedAlias('/old-secret')
  secret() {
    return { route: 'secret' };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return { route: 'findOne', id };
  }

  @Post(':id/cancel')
  @DeprecatedAlias('DELETE /items/:id')
  cancel(@Param('id') id: string) {
    return { route: 'cancel', id };
  }
}

@Controller('users')
class UsersController {
  @Post(':userId/unlock')
  @DeprecatedAlias('POST /admin/users/:userId/unlock')
  unlock(@Param('userId') userId: string) {
    return { route: 'unlock', userId };
  }
}

/** Ancien chemin en GET d'une action devenue POST : la protection CSRF doit
 *  juger le verbe servi, pas celui de l'ancien chemin. */
@Controller('archives')
class ArchivesController {
  @Post(':id')
  @DeprecatedAlias('GET /archive-old/:id')
  archive(@Param('id') id: string) {
    return { route: 'archive', id };
  }
}

describe('collectDeprecatedAliases', () => {
  it('relève chaque ancien chemin avec son successeur, préfixe compris', () => {
    const aliases = collectDeprecatedAliases([ItemsController, UsersController], 'api');
    expect(aliases.map((a) => `${a.method} ${a.path} → ${a.successorMethod} ${a.successorPath}`)).toEqual([
      'GET /api/items/serial-history → GET /api/items/history',
      'GET /api/legacy/history → GET /api/items/history',
      'GET /api/old-secret → GET /api/items/secret',
      'DELETE /api/items/:id → POST /api/items/:id/cancel',
      'POST /api/admin/users/:userId/unlock → POST /api/users/:userId/unlock',
    ]);
  });

  it('refuse un alias dont les paramètres diffèrent du nouveau chemin', () => {
    @Controller('x')
    class Wrong {
      @Get(':id')
      @DeprecatedAlias('GET /old/:identifiant')
      one() {
        return null;
      }
    }
    expect(() => collectDeprecatedAliases([Wrong], 'api')).toThrow('paramètres');
  });

  it('refuse un ancien chemin encore servi par un contrôleur', () => {
    @Controller('x')
    class StillThere {
      @Get('new')
      @DeprecatedAlias('GET /x/old')
      fresh() {
        return null;
      }

      @Get('old')
      old() {
        return null;
      }
    }
    expect(() => collectDeprecatedAliases([StillThere], 'api')).toThrow('encore déclaré');
  });

  it('refuse une déclaration mal formée', () => {
    @Controller('x')
    class Malformed {
      @Get('new')
      @DeprecatedAlias('FETCH /x/old')
      fresh() {
        return null;
      }
    }
    expect(() => collectDeprecatedAliases([Malformed], 'api')).toThrow('mal formé');
  });
});

describe('alias dépréciés servis par l’application', () => {
  let app: INestApplication;
  const warnings: string[] = [];
  const workDir = mkdtempSync(join(tmpdir(), 'bmad-alias-'));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ItemsController, UsersController, ArchivesController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, {
      corsOrigin: 'https://bons.example.test',
      uploadsDir: join(workDir, 'uploads'),
      aliasLogger: { warn: (message) => warnings.push(message) },
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    warnings.length = 0;
  });

  const server = () => app.getHttpServer();

  it('le nouveau chemin répond sans en-tête de dépréciation', async () => {
    const res = await request(server()).get('/api/items/history?q=SN-1');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('l’ancien chemin est servi par le même handler, requête comprise, avec Deprecation et Link', async () => {
    const res = await request(server()).get('/api/items/serial-history?q=SN-1').set('User-Agent', 'onglet-ancien');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: 'history', q: 'SN-1' });
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe('</api/items/history>; rel="successor-version"');
    expect(warnings).toEqual([
      "Ancien chemin d'API appelé : GET /api/items/serial-history → GET /api/items/history (user-agent : onglet-ancien)",
    ]);
  });

  it('un ancien chemin qui ressemble à une route paramétrée n’est pas capturé par elle', async () => {
    const res = await request(server()).get('/api/items/serial-history');
    expect(res.body.route).toBe('history');
  });

  it('change de verbe et recopie les paramètres (DELETE /items/:id → POST /items/:id/cancel)', async () => {
    const res = await request(server()).delete('/api/items/42').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ route: 'cancel', id: '42' });
    expect(res.headers.link).toBe('</api/items/42/cancel>; rel="successor-version"');
  });

  it('passe d’un contrôleur à l’autre', async () => {
    const res = await request(server()).post('/api/admin/users/u-7/unlock').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.body).toEqual({ route: 'unlock', userId: 'u-7' });
  });

  it('applique les gardes du nouveau handler : même refus, même forme d’erreur', async () => {
    const res = await request(server()).get('/api/old-secret');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, code: 'forbidden' });
    expect(res.headers.deprecation).toBe('true');
  });

  it('la protection CSRF s’applique à l’ancien chemin comme au nouveau', async () => {
    const res = await request(server()).delete('/api/items/42');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('csrf_rejected');
  });

  it('un ancien GET réécrit en POST reste soumis à la protection CSRF', async () => {
    const refused = await request(server()).get('/api/archive-old/9');
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('csrf_rejected');

    const served = await request(server()).get('/api/archive-old/9').set('X-Requested-With', 'XMLHttpRequest');
    expect(served.body).toEqual({ route: 'archive', id: '9' });
  });

  it('un autre verbe sur l’ancien chemin n’est pas réécrit', async () => {
    const res = await request(server()).post('/api/items/serial-history').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(404);
    expect(res.headers.deprecation).toBeUndefined();
  });
});

describe('journal des alias', () => {
  const alias = {
    method: 'GET' as const,
    path: '/api/old',
    successorMethod: 'GET' as const,
    successorPath: '/api/new',
    handler: 'X.y',
  };
  const call = (middleware: ReturnType<typeof deprecatedAliasMiddleware>, userAgent?: string) =>
    middleware(
      { method: 'GET', path: '/api/old', url: '/api/old', headers: { 'user-agent': userAgent } } as never,
      { setHeader: vi.fn() } as never,
      vi.fn(),
    );

  it('un message au premier appel, puis au plus un par intervalle, avec le nombre d’appels', () => {
    const warn = vi.fn();
    let time = 0;
    const middleware = deprecatedAliasMiddleware([alias], { warn }, { intervalMs: 1000, now: () => time });

    call(middleware, 'a');
    time = 500;
    call(middleware, 'a');
    call(middleware, 'a');
    expect(warn).toHaveBeenCalledOnce();

    time = 1500;
    call(middleware, 'a');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain('— 3 appels depuis le précédent message');
  });

  it('user-agent sans retour à la ligne (fausse ligne de journal) et tronqué', () => {
    const warn = vi.fn();
    call(deprecatedAliasMiddleware([alias], { warn }), `forgé\n[Nest] faux message${'x'.repeat(300)}`);
    const message = warn.mock.calls[0][0] as string;
    expect(message).not.toContain('\n');
    expect(message).toContain('forgé [Nest] faux message');
    expect(message.length).toBeLessThan(400);
  });
});

describe('deprecatedAliasMiddleware sans alias', () => {
  it('laisse passer toute requête', () => {
    const next = vi.fn();
    const middleware = deprecatedAliasMiddleware([], { warn: vi.fn() });
    middleware({ method: 'GET', path: '/api/x', url: '/api/x', headers: {} } as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
