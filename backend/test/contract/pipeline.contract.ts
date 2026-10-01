/**
 * Contrat de la chaîne HTTP commune à toutes les routes : forme UNIQUE des
 * erreurs `{ statusCode, code, message, details? }` (protection CSRF, garde
 * d'authentification, rôles, validation, JSON illisible, erreurs métier,
 * conflits), et alias dépréciés. Le front lit ces corps dans `lib/api.ts`
 * (`ApiError.code`, `.message`, `.details`). Le relevé exhaustif, route par
 * route, est dans errors.contract.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { ENUM_PARITY } from './support/enum-parity';
import { DUPLICATE_SERIAL } from './support/fixtures';
import { expectShape } from './support/shape';
import { equipmentHistory } from './shapes/equipment';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Chaîne HTTP commune', () => {
  it('les énumérations des contrats sont celles du schéma Prisma (vérifié à la compilation)', () => {
    expect(ENUM_PARITY.every(Boolean)).toBe(true);
  });
});

describe('Erreur unique { statusCode, code, message, details? }', () => {
  it('écriture sans X-Requested-With : 403 csrf_rejected', async () => {
    const res = await ctx.http.raw().post('/api/bons').set('X-Forwarded-For', '10.250.0.1').send({});
    expect(res.status).toBe(403);
    expectShape(res.body, apiError);
    expect(res.body).toMatchObject({ statusCode: 403, code: 'csrf_rejected' });
  });

  it('route protégée sans session : 401 unauthorized, message français', async () => {
    const res = await ctx.http.get('/bons', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
    expect(res.body).toEqual({
      statusCode: 401,
      code: 'unauthorized',
      message: 'Session absente ou expirée : reconnectez-vous.',
    });
  });

  it('rôle insuffisant : 403 forbidden, message français', async () => {
    const res = await ctx.http.get('/bons', 'collaborator');
    expect(res.status).toBe(403);
    expectShape(res.body, apiError);
    expect(res.body).toEqual({ statusCode: 403, code: 'forbidden', message: 'Droits insuffisants pour cette action' });
  });

  it('corps invalide : 400 validation_failed, message en chaîne, champs dans details.errors', async () => {
    const res = await ctx.http.post('/bons', 'technician', { champInconnu: true });
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('validation_failed');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.details?.errors).toContainEqual({
      field: 'champInconnu',
      messages: ['property champInconnu should not exist'],
    });
  });

  it('JSON illisible : 400 invalid_json', async () => {
    const res = await ctx.http
      .send('post', '/bons', 'technician')
      .set('Content-Type', 'application/json')
      .send('{"filialeId": ');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('invalid_json');
  });

  it('bon inexistant : 404 not_found', async () => {
    const res = await ctx.http.get('/bons/00000000-0000-4000-8000-000000000000', 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('not_found');
  });

  it('adresse d’API inconnue : 404 route_not_found', async () => {
    const res = await ctx.http.get('/route-qui-n-existe-pas', 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('route_not_found');
  });

  // Les deux cas suivants passent par des routes de domaine, dont chaque lot
  // peut préciser le code (`already_exists`, `contestation_already_open`…) :
  // on vérifie ici la forme commune, pas le code choisi par le domaine.
  it('règle métier refusée par un service : erreur 4xx à la forme unique, message du service', async () => {
    // Nom de filiale déjà pris (sans tenir compte de la casse).
    const res = await ctx.http.post('/filiales', 'admin', { name: 'CONTRAT-NORD', displayName: 'Doublon' });
    expect([400, 409]).toContain(res.status);
    expectShape(res.body, apiError);
    expect(res.body.statusCode).toBe(res.status);
    expect(res.body.code).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    expect(res.body.message.trim()).not.toBe('');
  });

  it('conflit avec l’état du bon : 409 à la forme unique, message du service', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.contested.id}/contestation`, 'collaborator', {
      message: 'Deuxième contestation',
    });
    expect(res.status).toBe(409);
    expectShape(res.body, apiError);
    expect(res.body.code).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    expect(res.body.message).not.toMatch(/^Conflict$/);
  });
});

describe('Alias déprécié', () => {
  it('GET /equipment/serial-history est servi par GET /equipment/history, avec Deprecation et Link', async () => {
    const current = await ctx.http.get(`/equipment/history?q=${DUPLICATE_SERIAL}`, 'technician');
    const legacy = await ctx.http.get(`/equipment/serial-history?q=${DUPLICATE_SERIAL}`, 'technician');

    expect(legacy.status).toBe(200);
    expectShape(legacy.body, equipmentHistory);
    expect(legacy.body).toEqual(current.body);
    expect(legacy.headers.deprecation).toBe('true');
    expect(legacy.headers.link).toBe('</api/equipment/history>; rel="successor-version"');
    expect(current.headers.deprecation).toBeUndefined();
  });

  it('l’alias applique les droits du nouveau chemin : 401 sans session, à la forme unique', async () => {
    const res = await ctx.http.get('/equipment/serial-history?q=x', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });
});
