/**
 * Contrat du pilotage : inventaire du parc prêté (`/api/reporting/inventory`),
 * indicateurs du tableau de bord (`/api/kpi/*`) et journal d'audit
 * (`/api/audit`). Les indicateurs et l'inventaire sont ouverts à la direction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT, IT_AND_DIRECTION, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { arrayOf, expectShape, str } from './support/shape';
import { kpiDelais, kpiIncidents, kpiList, kpiParc, kpiToday } from './shapes/kpi';
import { auditList, inventoryByCollaborateur, inventoryList, inventorySummary } from './shapes/reporting';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /reporting/inventory', IT_AND_DIRECTION),
  rule('GET /reporting/inventory/summary', IT_AND_DIRECTION),
  rule('GET /reporting/inventory/by-collaborateur', IT_AND_DIRECTION),
  rule('GET /reporting/inventory/export', IT_AND_DIRECTION),
  rule('GET /kpi/parc', IT_AND_DIRECTION),
  rule('GET /kpi/delais', IT_AND_DIRECTION),
  rule('GET /kpi/incidents', IT_AND_DIRECTION),
  rule('GET /kpi/aujourdhui', IT),
  rule('GET /kpi/liste', IT, () => '/kpi/liste?indicateur=bons_crees'),
  rule('GET /audit', ADMIN),
  rule('GET /audit/actions', ADMIN),
  rule('GET /audit/export', ADMIN),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Inventaire', () => {
  it('GET /reporting/inventory : enveloppe { items, total, page, limit }', async () => {
    const res = await ctx.http.get('/reporting/inventory?page=1&limit=25', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, inventoryList);
  });

  it('GET /reporting/inventory avec filtres (situation, retard) : même forme', async () => {
    const res = await ctx.http.get('/reporting/inventory?situation=en_circulation&overdue=true', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, inventoryList);
  });

  it('GET /reporting/inventory?horsCatalogue=1 : les équipements saisis en texte libre', async () => {
    const res = await ctx.http.get('/reporting/inventory?horsCatalogue=1', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, inventoryList);
    expect((res.body as { items: { label: string }[] }).items.map((i) => i.label)).toContain('Sacoche');
  });

  it('GET /reporting/inventory?situation=non_restitue : autant de lignes que la carte « Encore non restitués »', async () => {
    const [list, parc] = await Promise.all([
      ctx.http.get('/reporting/inventory?situation=non_restitue&limit=1', 'direction'),
      ctx.http.get('/kpi/parc', 'direction'),
    ]);
    expect(list.status).toBe(200);
    expect((list.body as { total: number }).total).toBe((parc.body as { notReturned: { openNow: number } }).notReturned.openNow);
  });

  it('GET /reporting/inventory?situation=non_restitue : le motif pour l’IT, jamais pour la direction', async () => {
    const declared = await ctx.prisma.bonEquipment.create({
      data: { bonId: ctx.data.bons.active.id, customLabel: 'Chargeur', notReturned: true, notReturnedReason: 'Perdu' },
    });
    try {
      const reasons = async (persona: 'admin' | 'direction') => {
        const res = await ctx.http.get('/reporting/inventory?situation=non_restitue&limit=200', persona);
        expect(res.status).toBe(200);
        expectShape(res.body, inventoryList);
        const items = (res.body as { items: { equipmentId: string; notReturnedReason: string | null }[] }).items;
        return items.find((i) => i.equipmentId === declared.id)?.notReturnedReason;
      };
      expect(await reasons('admin')).toBe('Perdu');
      expect(await reasons('direction')).toBeNull();
    } finally {
      await ctx.prisma.bonEquipment.delete({ where: { id: declared.id } });
    }
  });

  it('GET /reporting/inventory avec une situation inconnue : 400', async () => {
    const res = await ctx.http.get('/reporting/inventory?situation=perdu', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('GET /reporting/inventory avec une limite hors bornes : 400', async () => {
    const res = await ctx.http.get('/reporting/inventory?limit=5000', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('GET /reporting/inventory/summary : agrégats du parc', async () => {
    const res = await ctx.http.get('/reporting/inventory/summary', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, inventorySummary);
  });

  it.each(['/reporting/inventory/by-collaborateur?limit=25', '/reporting/inventory/by-collaborateur?compte=inactif&limit=1'])(
    'GET %s : { items, total, page, limit, truncated }',
    async (path) => {
      const res = await ctx.http.get(path, 'admin');
      expect(res.status).toBe(200);
      expectShape(res.body, inventoryByCollaborateur);
    },
  );

  it('GET /reporting/inventory/export : fichier CSV', async () => {
    const res = await ctx.http.get('/reporting/inventory/export', 'direction');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.csv"$/);
  });
});

describe('Indicateurs du tableau de bord', () => {
  it('GET /kpi/parc', async () => {
    const res = await ctx.http.get('/kpi/parc', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, kpiParc);
  });

  it('GET /kpi/delais (période et filiale explicites)', async () => {
    const res = await ctx.http.get(`/kpi/delais?filialeId=${ctx.data.filialeId}`, 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, kpiDelais);
  });

  it('GET /kpi/incidents', async () => {
    const res = await ctx.http.get('/kpi/incidents', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, kpiIncidents);
  });

  it('GET /kpi/aujourdhui : tuiles et sections « À traiter »', async () => {
    const res = await ctx.http.get('/kpi/aujourdhui', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, kpiToday);
  });

  it('GET /kpi/aujourdhui : « Signature en retard » = liste GET /bons?overdue=1', async () => {
    const today = await ctx.http.get('/kpi/aujourdhui', 'admin');
    const list = await ctx.http.get('/bons?overdue=1&limit=1', 'admin');
    expect(list.status).toBe(200);
    expect((today.body as { overdueSignatures: number }).overdueSignatures).toBe((list.body as { total: number }).total);
  });

  it('GET /kpi/aujourdhui : « Retour en retard » = inventaire filtré', async () => {
    const today = await ctx.http.get('/kpi/aujourdhui', 'admin');
    const list = await ctx.http.get('/reporting/inventory?overdue=1&limit=1', 'admin');
    expect((today.body as { overdueReturns: { equipments: number } }).overdueReturns.equipments)
      .toBe((list.body as { total: number }).total);
  });

  it('GET /kpi/aujourdhui : « Restitution partielle à signer » = liste GET /bons?subStatus=partial_restitution_to_sign', async () => {
    const today = await ctx.http.get('/kpi/aujourdhui', 'technician');
    const list = await ctx.http.get('/bons?subStatus=partial_restitution_to_sign&limit=100', 'technician');
    expect(list.status).toBe(200);
    const section = (today.body as { toDo: { partialRestitutionsToSign: { total: number; rows: { bonId: string }[] } } })
      .toDo.partialRestitutionsToSign;
    const listed = list.body as { total: number; bons: { id: string }[] };
    // Le jeu de données contient un bon « Restitution en cours » dont un équipement rendu attend sa signature.
    expect(section.total).toBeGreaterThan(0);
    expect(section.total).toBe(listed.total);
    expect(section.rows.map((r) => r.bonId)).toContain(ctx.data.bons.partiallyReturned.id);
    expect(listed.bons.map((b) => b.id)).toContain(ctx.data.bons.partiallyReturned.id);
  });

  it('GET /kpi/liste : la liste exacte de la carte « Bons créés »', async () => {
    const [list, delais] = await Promise.all([
      ctx.http.get('/kpi/liste?indicateur=bons_crees&limit=200', 'technician'),
      ctx.http.get('/kpi/delais', 'technician'),
    ]);
    expect(list.status).toBe(200);
    expectShape(list.body, kpiList);
    const created = (delais.body as { volumes: { created: { current: number } } }).volumes.created.current;
    expect((list.body as { total: number }).total).toBe(created);
  });

  it('GET /kpi/liste avec un indicateur inconnu : 400', async () => {
    const res = await ctx.http.get('/kpi/liste?indicateur=bons_perdus', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('GET /kpi/parc avec une période invalide : 400', async () => {
    const res = await ctx.http.get('/kpi/parc?from=2026-13-40', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });
});

describe('Journal d’audit', () => {
  it('GET /audit : { logs, total, page, limit, exportLimit, exportTruncated }', async () => {
    const res = await ctx.http.get('/audit?page=1&limit=50', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, auditList);
  });

  it('GET /audit/actions : tableau de chaînes', async () => {
    const res = await ctx.http.get('/audit/actions', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(str, { minLength: 1 }));
  });

  it('GET /audit/export : fichier CSV', async () => {
    const res = await ctx.http.get('/audit/export', 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.csv"$/);
  });
});
