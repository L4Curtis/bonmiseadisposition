/**
 * Forme UNIQUE des erreurs, route par route : TOUTES les routes de
 * l'application (relevées dans les métadonnées Nest, comme le test des droits
 * `src/auth/__tests__/route-access.spec.ts`) sont appelées pour de bon, et
 * chaque refus doit avoir la forme `{ statusCode, code, message, details? }` :
 *  - 401 `unauthorized` sans session, pour toute route non publique ;
 *  - 403 `forbidden` pour un collaborateur, sur toute route qui lui est fermée ;
 *  - 403 `csrf_rejected` pour toute écriture sans `X-Requested-With`.
 * Les gardes et la protection CSRF passent avant le handler : aucun de ces
 * appels ne modifie le jeu de données. Les cas 400, 404 et 409 sont vérifiés
 * dans pipeline.contract.ts, les erreurs propres à un domaine dans son fichier.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { inventoryRoutes, RouteAccess } from '../../src/auth/__tests__/helpers/route-inventory';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import type { HttpMethod } from './support/http';
import { expectShape } from './support/shape';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Seule route exemptée de la protection CSRF (retour OAuth, protégé par `state`). */
const CSRF_EXEMPT = new Set(['POST /api/auth/callback']);

const routes = inventoryRoutes(AppModule);
const label = (route: RouteAccess): string => `${route.method} ${route.path}`;

/** Chemin appelable, sans le préfixe /api, paramètres remplacés. */
function callablePath(route: RouteAccess): string {
  return route.path.replace(/^\/api/, '').replace(/:[A-Za-z]+/g, UNKNOWN_ID);
}

function httpMethod(route: RouteAccess): HttpMethod {
  return route.method.toLowerCase() as HttpMethod;
}

function bodyFor(route: RouteAccess): object | undefined {
  return route.method === 'GET' ? undefined : {};
}

const protectedRoutes = routes.filter((r) => !r.isPublic);
const closedToCollaborator = protectedRoutes.filter((r) => !r.roles.includes('collaborator'));
const writes = routes.filter((r) => STATE_CHANGING.has(r.method) && !CSRF_EXEMPT.has(label(r)));

describe('Relevé des routes', () => {
  it('couvre bien l’application (garde-fou contre un relevé vide)', () => {
    expect(protectedRoutes.length).toBeGreaterThan(100);
    expect(closedToCollaborator.length).toBeGreaterThan(80);
    expect(writes.length).toBeGreaterThan(50);
  });
});

describe('401 unauthorized sans session, sur toute route non publique', () => {
  it.each(protectedRoutes.map((r) => [label(r), r] as const))('%s', async (_name, route) => {
    const res = await ctx.http.send(httpMethod(route), callablePath(route), 'anonymous', bodyFor(route));
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('unauthorized');
  });
});

describe('403 forbidden pour un collaborateur, sur toute route qui lui est fermée', () => {
  it.each(closedToCollaborator.map((r) => [label(r), r] as const))('%s', async (_name, route) => {
    const res = await ctx.http.send(httpMethod(route), callablePath(route), 'collaborator', bodyFor(route));
    expect(res.status).toBe(403);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('forbidden');
  });
});

describe('403 csrf_rejected pour toute écriture sans X-Requested-With', () => {
  it.each(writes.map((r, index) => [label(r), r, index] as const))('%s', async (_name, route, index) => {
    const res = await ctx.http
      .raw()
      [httpMethod(route)](`/api${callablePath(route)}`)
      .set('X-Forwarded-For', `10.251.${(index >> 8) & 255}.${index & 255}`)
      .send({});
    expect(res.status).toBe(403);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('csrf_rejected');
  });
});

describe('Erreurs des routes publiques', () => {
  it('connexion refusée : 401 à la forme unique', async () => {
    const res = await ctx.http.post('/auth/local-login', 'anonymous', {
      email: 'personne@contrat.test',
      password: 'mauvais-mot-de-passe',
    });
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it('rafraîchissement sans cookie : 401 à la forme unique', async () => {
    const res = await ctx.http.post('/auth/refresh', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });
});
