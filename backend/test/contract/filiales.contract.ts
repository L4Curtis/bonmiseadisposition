/**
 * Contrat des filiales (`/api/filiales`) : gestion réservée à
 * l'administrateur (liste, création, modification, logo et cachet, import et
 * exports CSV) ; filiales actives réduites à leur identité pour l'IT et la
 * direction (menus du formulaire de bon et des filtres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT_AND_DIRECTION, rule } from './support/access';
import { ContractContext, startContractContext } from './support/context';
import { arrayOf, expectShape } from './support/shape';
import { filiale, filialeImportResult, filialeSummary } from './shapes/filiales';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Plus petit PNG valide (1 × 1 pixel transparent). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const ACCESS: readonly AccessRule[] = [
  rule('GET /filiales', ADMIN),
  rule('GET /filiales/active', IT_AND_DIRECTION),
  rule('GET /filiales/:id', ADMIN, (d) => `/filiales/${d.filialeId}`),
  rule('POST /filiales', ADMIN),
  rule('PUT /filiales/:id', ADMIN, (d) => `/filiales/${d.filialeId}`),
  rule('PATCH /filiales/:id/logo', ADMIN, (d) => `/filiales/${d.filialeId}/logo`),
  rule('PATCH /filiales/:id/stamp', ADMIN, (d) => `/filiales/${d.filialeId}/stamp`),
  rule('DELETE /filiales/:id', ADMIN, (d) => `/filiales/${d.inactiveFilialeId}`),
  rule('POST /filiales/import', ADMIN),
  rule('GET /filiales/export', ADMIN),
  rule('GET /filiales/import/template', ADMIN),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Lecture', () => {
  it('GET /filiales : tableau nu, filiales désactivées comprises', async () => {
    const res = await ctx.http.get('/filiales', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(filiale, { minLength: 2 }));
  });

  it('GET /filiales/active : identité des seules filiales actives (sans cachet ni adresse)', async () => {
    const res = await ctx.http.get('/filiales/active', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(filialeSummary, { minLength: 1 }));
    expect((res.body as { active: boolean }[]).every((f) => f.active)).toBe(true);
  });

  it('GET /filiales/:id : la filiale complète', async () => {
    const res = await ctx.http.get(`/filiales/${ctx.data.filialeId}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
  });
});

describe('Écriture', () => {
  it('POST /filiales : 201 et la filiale créée', async () => {
    const res = await ctx.http.post('/filiales', 'admin', { name: 'contrat-est', displayName: 'Contrat Est' });
    expect(res.status).toBe(201);
    expectShape(res.body, filiale);
  });

  it('PUT /filiales/:id : la filiale modifiée', async () => {
    const res = await ctx.http.put(`/filiales/${ctx.data.filialeId}`, 'admin', { address: '2 rue du Contrat, 59000 Lille' });
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
  });

  it.each(['logo', 'stamp'])('PATCH /filiales/:id/%s (multipart) : la filiale avec son image', async (kind) => {
    const res = await ctx.http
      .send('patch', `/filiales/${ctx.data.filialeId}/${kind}`, 'admin')
      .attach('file', PNG_1PX, { filename: `${kind}.png`, contentType: 'image/png' });
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
  });

  it('DELETE /filiales/:id : la filiale supprimée, telle qu’elle était', async () => {
    const res = await ctx.http.delete(`/filiales/${ctx.data.inactiveFilialeId}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
  });

  it('POST /filiales/import : 201 et compte rendu', async () => {
    const res = await ctx.http.post('/filiales/import', 'admin', {
      items: [{ name: 'contrat-ouest', displayName: 'Contrat Ouest' }, { displayName: 'Sans nom' }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, filialeImportResult);
  });
});

describe('Exports CSV', () => {
  it.each(['/filiales/export', '/filiales/export?images=1', '/filiales/import/template'])('GET %s : fichier CSV', async (path) => {
    const res = await ctx.http.get(path, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.csv"$/);
  });
});
