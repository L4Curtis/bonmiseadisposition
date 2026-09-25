/**
 * Contrat du matériel : catalogue, packs, historique d'un équipement et
 * conflits de numéros de série (l'avertissement perdu par le commit 650508f).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, expectAccessRule, IT, IT_AND_DIRECTION, rule } from './support/access';
import { ContractContext, startContractContext } from './support/context';
import { DUPLICATE_SERIAL, INVENTORY_NUMBER } from './support/fixtures';
import { arrayOf, expectShape } from './support/shape';
import {
  catalogImportResult,
  catalogItem,
  equipmentHistory,
  pack,
  packRecord,
  serialConflicts,
} from './shapes/equipment';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /equipment/catalog', IT),
  rule('POST /equipment/catalog', IT),
  rule('PUT /equipment/catalog/:id', IT, (d) => `/equipment/catalog/${d.catalog.laptopId}`),
  rule('DELETE /equipment/catalog/:id', IT, (d) => `/equipment/catalog/${d.catalog.laptopId}`),
  rule('POST /equipment/catalog/import', IT),
  rule('GET /equipment/packs', IT),
  rule('POST /equipment/packs', IT),
  rule('PUT /equipment/packs/:id', IT, (d) => `/equipment/packs/${d.catalog.packId}`),
  rule('DELETE /equipment/packs/:id', IT, (d) => `/equipment/packs/${d.catalog.packId}`),
  rule('GET /equipment/history', IT_AND_DIRECTION, () => `/equipment/history?q=${DUPLICATE_SERIAL}`),
  rule('GET /equipment/history/export', IT_AND_DIRECTION, () => `/equipment/history/export?q=${DUPLICATE_SERIAL}`),
  rule('GET /equipment/serial-conflicts', IT, () => `/equipment/serial-conflicts?serials=${DUPLICATE_SERIAL}`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Conflits de numéros de série', () => {
  it('GET /equipment/serial-conflicts : enveloppe { items, truncated }, jamais un tableau nu', async () => {
    const res = await ctx.http.get(`/equipment/serial-conflicts?serials=${DUPLICATE_SERIAL},SN-INCONNU`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, serialConflicts);
    expect(res.body.truncated).toBe(false);
  });

  it('excludeBonId retire le bon en cours d’édition des conflits', async () => {
    const { draft } = ctx.data.bons;
    const res = await ctx.http.get(
      `/equipment/serial-conflicts?serials=${DUPLICATE_SERIAL}&excludeBonId=${draft.id}`,
      'technician',
    );
    expect(res.status).toBe(200);
    expectShape(res.body, serialConflicts);
    const bonIds = (res.body as { items: { bonId: string }[] }).items.map((item) => item.bonId);
    expect(bonIds).not.toContain(draft.id);
  });
});

describe('Historique d’un équipement', () => {
  it.each([DUPLICATE_SERIAL, INVENTORY_NUMBER])('GET /equipment/history?q=%s : { items, truncated, total }', async (q) => {
    const res = await ctx.http.get(`/equipment/history?q=${encodeURIComponent(q)}`, 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, equipmentHistory);
  });

  it('GET /equipment/history/export : fichier CSV', async () => {
    const res = await ctx.http.get(`/equipment/history/export?q=${DUPLICATE_SERIAL}`, 'technician');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.csv"$/);
  });
});

describe('Catalogue', () => {
  it('GET /equipment/catalog : tableau nu d’articles, désactivés compris', async () => {
    const res = await ctx.http.get('/equipment/catalog', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(catalogItem, { minLength: 3 }));
  });

  it('POST /equipment/catalog : 201 et l’article créé', async () => {
    const res = await ctx.http.post('/equipment/catalog', 'technician', {
      category: 'clavier',
      brand: 'Logitech',
      model: 'K120 contrat',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, catalogItem);
  });

  it('PUT /equipment/catalog/:id : l’article modifié', async () => {
    const res = await ctx.http.put(`/equipment/catalog/${ctx.data.catalog.screenId}`, 'technician', {
      description: 'Écran 24 pouces',
    });
    expect(res.status).toBe(200);
    expectShape(res.body, catalogItem);
  });

  it('POST /equipment/catalog/import : 201 et compte rendu', async () => {
    const res = await ctx.http.post('/equipment/catalog/import', 'technician', {
      items: [{ category: 'casque', brand: 'Jabra', model: 'Evolve 20 contrat' }, { category: 'inconnue' }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, catalogImportResult);
  });

  it('DELETE /equipment/catalog/:id : l’article désactivé (suppression logique)', async () => {
    const created = await ctx.http.post('/equipment/catalog', 'admin', { category: 'dock', brand: 'Dell', model: 'WD19 contrat' });
    const res = await ctx.http.delete(`/equipment/catalog/${created.body.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, catalogItem);
    expect(res.body.active).toBe(false);
  });
});

describe('Packs', () => {
  it('GET /equipment/packs : packs avec leurs articles complets', async () => {
    const res = await ctx.http.get('/equipment/packs', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(pack, { minLength: 1 }));
  });

  it('POST /equipment/packs : 201 et le pack avec ses articles', async () => {
    const res = await ctx.http.post('/equipment/packs', 'technician', {
      name: 'Pack contrat',
      items: [{ catalogItemId: ctx.data.catalog.laptopId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, pack);
  });

  it('PUT /equipment/packs/:id : le pack modifié avec ses articles', async () => {
    const res = await ctx.http.put(`/equipment/packs/${ctx.data.catalog.packId}`, 'technician', { description: 'Poste bureautique' });
    expect(res.status).toBe(200);
    expectShape(res.body, pack);
  });

  it('DELETE /equipment/packs/:id : le pack désactivé, SANS ses articles', async () => {
    const created = await ctx.http.post('/equipment/packs', 'admin', { name: 'Pack à désactiver' });
    const res = await ctx.http.delete(`/equipment/packs/${created.body.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, packRecord);
  });
});
