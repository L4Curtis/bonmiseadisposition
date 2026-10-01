/**
 * Contrat du matériel : catalogue, packs, historique d'un équipement et
 * conflits de numéros de série (l'avertissement perdu par le commit 650508f).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, expectAccessRule, IT, IT_AND_DIRECTION, rule } from './support/access';
import { ContractContext, startContractContext } from './support/context';
import { DUPLICATE_SERIAL, INVENTORY_NUMBER } from './support/fixtures';
import { apiError, listOf } from './support/common-shapes';
import { expectShape } from './support/shape';
import {
  catalogImportResult,
  catalogItem,
  equipmentHistory,
  pack,
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

describe('Routes retirées (jamais appelées par l’écran)', () => {
  it.each(['/equipment/catalog/search?q=Dell', '/equipment/catalog/active', '/equipment/packs/active'])(
    'GET %s ne renvoie plus de liste',
    async (path) => {
      const res = await ctx.http.get(path, 'admin');
      // `catalog/:id` et `packs/:id` captent désormais ces chemins : identifiant inconnu.
      expect(res.status).toBe(404);
      expectShape(res.body, apiError);
    },
  );
});

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Conflits de numéros de série', () => {
  it('GET /equipment/serial-conflicts : liste à la forme commune, jamais un tableau nu', async () => {
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
  it.each([DUPLICATE_SERIAL, INVENTORY_NUMBER])('GET /equipment/history?q=%s : liste paginée', async (q) => {
    const res = await ctx.http.get(`/equipment/history?q=${encodeURIComponent(q)}`, 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, equipmentHistory);
    expect(res.body).toMatchObject({ page: 1, limit: 25, truncated: false, meta: { exportLimit: 5000 } });
  });

  it('GET /equipment/history?page=2 : la page demandée, total inchangé', async () => {
    const first = await ctx.http.get(`/equipment/history?q=${DUPLICATE_SERIAL}`, 'technician');
    const second = await ctx.http.get(`/equipment/history?q=${DUPLICATE_SERIAL}&page=2`, 'technician');
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ page: 2, total: first.body.total });
  });

  it.each(['limit=200', 'page=0'])('GET /equipment/history?%s : 400 validation_failed', async (query) => {
    const res = await ctx.http.get(`/equipment/history?q=${DUPLICATE_SERIAL}&${query}`, 'technician');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });

  it('GET /equipment/history/export : CSV historique-equipement-AAAA-MM-JJ.csv', async () => {
    const res = await ctx.http.get(`/equipment/history/export?q=${DUPLICATE_SERIAL}`, 'technician');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="historique-equipement-\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});

describe('Catalogue', () => {
  it('GET /equipment/catalog : liste complète en une page, articles désactivés compris', async () => {
    const res = await ctx.http.get('/equipment/catalog', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, listOf(catalogItem, { minLength: 3 }));
  });

  it('POST /equipment/catalog en double : 409 catalog_item_exists', async () => {
    const res = await ctx.http.post('/equipment/catalog', 'technician', { category: 'ecran', brand: 'Dell', model: 'P2422H' });
    expect(res.status).toBe(409);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('catalog_item_exists');
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
  it('GET /equipment/packs : packs avec leurs articles complets, en une page', async () => {
    const res = await ctx.http.get('/equipment/packs', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, listOf(pack, { minLength: 1 }));
  });

  it('POST /equipment/packs avec un article désactivé : 400 pack_items_unavailable', async () => {
    const res = await ctx.http.post('/equipment/packs', 'technician', {
      name: 'Pack refusé',
      items: [{ catalogItemId: ctx.data.catalog.retiredId, quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('pack_items_unavailable');
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

  it('DELETE /equipment/packs/:id : le pack désactivé, avec ses articles', async () => {
    const created = await ctx.http.post('/equipment/packs', 'admin', {
      name: 'Pack à désactiver',
      items: [{ catalogItemId: ctx.data.catalog.screenId, quantity: 2 }],
    });
    const res = await ctx.http.delete(`/equipment/packs/${created.body.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, pack);
    expect(res.body).toMatchObject({ active: false, items: [{ catalogItemId: ctx.data.catalog.screenId, quantity: 2 }] });
  });
});
