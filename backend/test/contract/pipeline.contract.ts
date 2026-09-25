/**
 * Contrat de la chaîne HTTP commune à toutes les routes : protection CSRF,
 * garde d'authentification, validation des corps, erreurs métier et erreurs
 * de base de données traduites par le filtre global. Le front lit ces corps
 * d'erreur dans `lib/api.ts` (`buildError`) pour afficher le message.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csrfError, nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { ENUM_PARITY } from './support/enum-parity';
import { expectShape } from './support/shape';

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

  it('écriture sans X-Requested-With : 403 de la protection CSRF, corps { message } sans statusCode', async () => {
    const res = await ctx.http.raw().post('/api/bons').set('X-Forwarded-For', '10.250.0.1').send({});
    expect(res.status).toBe(403);
    expectShape(res.body, csrfError);
  });

  it('route protégée sans session : 401 au format NestJS', async () => {
    const res = await ctx.http.get('/bons', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, nestError);
  });

  it('rôle insuffisant : 403 au format NestJS, message en français', async () => {
    const res = await ctx.http.get('/bons', 'collaborator');
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
    expect(res.body.message).toBe('Droits insuffisants pour cette action');
  });

  it('corps invalide : 400 du ValidationPipe, `message` en tableau de chaînes', async () => {
    const res = await ctx.http.post('/bons', 'technician', { champInconnu: true });
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('bon inexistant : 404 au format NestJS', async () => {
    const res = await ctx.http.get('/bons/00000000-0000-4000-8000-000000000000', 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, nestError);
  });

  it('règle métier refusée par un service : 400 au format NestJS', async () => {
    // Nom de filiale déjà pris (sans tenir compte de la casse) : le service
    // traduit la violation d'unicité en 400 lisible.
    const res = await ctx.http.post('/filiales', 'admin', { name: 'CONTRAT-NORD', displayName: 'Doublon' });
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });
});
