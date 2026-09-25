/**
 * Contrat du pilotage : inventaire du parc prêté (`/api/reporting/inventory`),
 * indicateurs du tableau de bord (`/api/kpi/*`) et journal d'audit
 * (`/api/audit`). Les indicateurs et l'inventaire sont ouverts à la direction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT_AND_DIRECTION, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { arrayOf, expectShape, str } from './support/shape';
import { kpiDelais, kpiIncidents, kpiParc } from './shapes/kpi';
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
