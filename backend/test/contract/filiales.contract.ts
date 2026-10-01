/**
 * Contrat des filiales (`/api/filiales`) : gestion réservée à
 * l'administrateur (liste, création, modification, logo et cachet, import et
 * exports CSV) ; filiales actives réduites à leur identité pour l'IT et la
 * direction (menus du formulaire de bon et des filtres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT_AND_DIRECTION, rule } from './support/access';
import { ContractContext, startContractContext } from './support/context';
import { apiError, listOf } from './support/common-shapes';
import { expectShape } from './support/shape';
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
  it('GET /filiales : liste complète en une page, filiales désactivées comprises', async () => {
    const res = await ctx.http.get('/filiales', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, listOf(filiale, { minLength: 2 }));
    expect(res.body).toMatchObject({ page: 1, total: res.body.items.length, limit: res.body.items.length, truncated: false });
  });

  it('GET /filiales/active : identité des seules filiales actives (sans cachet ni adresse)', async () => {
    const res = await ctx.http.get('/filiales/active', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, listOf(filialeSummary, { minLength: 1 }));
    expect((res.body.items as { active: boolean }[]).every((f) => f.active)).toBe(true);
  });

  it('GET /filiales/:id : la filiale complète', async () => {
    const res = await ctx.http.get(`/filiales/${ctx.data.filialeId}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
  });
});

/** Dernière entrée d'audit de l'action, avec ses détails. */
async function lastAudit(action: string) {
  return ctx.prisma.auditLog.findFirst({ where: { action }, orderBy: { createdAt: 'desc' } });
}

describe('Écriture', () => {
  it('POST /filiales : 201, la filiale créée, tracée au journal', async () => {
    const res = await ctx.http.post('/filiales', 'admin', { name: 'contrat-est', displayName: 'Contrat Est' });
    expect(res.status).toBe(201);
    expectShape(res.body, filiale);
    expect((await lastAudit('filiale_created'))?.details).toEqual({ filialeId: res.body.id, name: 'Contrat Est' });
  });

  it('POST /filiales avec un nom déjà pris : 409 filiale_name_taken', async () => {
    const res = await ctx.http.post('/filiales', 'admin', { name: 'CONTRAT-EST', displayName: 'Doublon' });
    expect(res.status).toBe(409);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('filiale_name_taken');
  });

  it('PUT /filiales/:id : la filiale modifiée, champs changés tracés', async () => {
    const res = await ctx.http.put(`/filiales/${ctx.data.filialeId}`, 'admin', { address: '2 rue du Contrat, 59000 Lille' });
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
    expect((await lastAudit('filiale_updated'))?.details).toMatchObject({ filialeId: ctx.data.filialeId, changedFields: ['address'] });
  });

  it('PUT /filiales/:id { active } : désactivation puis réactivation tracées', async () => {
    const created = await ctx.http.post('/filiales', 'admin', { name: 'contrat-centre', displayName: 'Contrat Centre' });
    await ctx.http.put(`/filiales/${created.body.id}`, 'admin', { active: false });
    await ctx.http.put(`/filiales/${created.body.id}`, 'admin', { active: true });
    expect((await lastAudit('filiale_deactivated'))?.details).toEqual({ filialeId: created.body.id, name: 'Contrat Centre' });
    expect((await lastAudit('filiale_reactivated'))?.details).toEqual({ filialeId: created.body.id, name: 'Contrat Centre' });
  });

  it.each([
    ['logo', 'filiale_logo_updated'],
    ['stamp', 'filiale_stamp_updated'],
  ])('PATCH /filiales/:id/%s (multipart) : la filiale avec son image, tracée (%s)', async (kind, action) => {
    const res = await ctx.http
      .send('patch', `/filiales/${ctx.data.filialeId}/${kind}`, 'admin')
      .attach('file', PNG_1PX, { filename: `${kind}.png`, contentType: 'image/png' });
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
    expect((await lastAudit(action))?.details).toMatchObject({ filialeId: ctx.data.filialeId, name: expect.any(String) });
  });

  it('PATCH /filiales/:id/stamp sans fichier : 400 file_missing', async () => {
    const res = await ctx.http.patch(`/filiales/${ctx.data.filialeId}/stamp`, 'admin', {});
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('file_missing');
  });

  it('DELETE /filiales/:id avec des comptes rattachés : 409 filiale_in_use', async () => {
    const res = await ctx.http.delete(`/filiales/${ctx.data.filialeId}`, 'admin');
    expect(res.status).toBe(409);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('filiale_in_use');
  });

  it('DELETE /filiales/:id : la filiale supprimée, telle qu’elle était, tracée', async () => {
    const res = await ctx.http.delete(`/filiales/${ctx.data.inactiveFilialeId}`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, filiale);
    expect((await lastAudit('filiale_deleted'))?.details).toMatchObject({ filialeId: ctx.data.inactiveFilialeId });
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
  it.each([
    ['/filiales/export', /^attachment; filename="filiales-\d{4}-\d{2}-\d{2}\.csv"$/],
    ['/filiales/export?images=1', /^attachment; filename="filiales-\d{4}-\d{2}-\d{2}\.csv"$/],
    ['/filiales/import/template', /^attachment; filename="modele-import-filiales\.csv"$/],
  ])('GET %s : fichier CSV nommé par le serveur', async (path, filename) => {
    const res = await ctx.http.get(path, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(filename);
  });

  it('GET /filiales/export?status=active : les seules filiales actives, comme l’écran', async () => {
    await ctx.prisma.filiale.create({ data: { name: 'contrat-export-off', displayName: 'Contrat Export Off', active: false } });
    const all = await ctx.http.get('/filiales/export', 'admin');
    const active = await ctx.http.get('/filiales/export?status=active', 'admin');
    expect(all.text).toContain('contrat-export-off');
    expect(active.status).toBe(200);
    expect(active.text).not.toContain('contrat-export-off');
  });

  it.each(['status=toutes', 'images=oui'])('GET /filiales/export?%s : 400 validation_failed', async (query) => {
    const res = await ctx.http.get(`/filiales/export?${query}`, 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('validation_failed');
  });
});
