/**
 * Contrat du journal d'audit (`/api/audit`), réservé à l'administrateur :
 * liste filtrée et paginée, actions présentes, export CSV lisible.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, rule } from './support/access';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { expectShape } from './support/shape';
import { auditActions, auditList } from './shapes/audit';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /audit', ADMIN),
  rule('GET /audit/actions', ADMIN),
  rule('GET /audit/export', ADMIN),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Journal d’audit', () => {
  it('GET /audit : liste à la forme unique, meta de l’export', async () => {
    const res = await ctx.http.get('/audit?page=1&limit=50', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, auditList);
    expect(res.body.limit).toBe(50);
  });

  it('GET /audit?limit=30 : taille de page hors liste, 400', async () => {
    const res = await ctx.http.get('/audit?limit=30', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('validation_failed');
  });

  it('GET /audit?domain=inconnu : famille inconnue, 400', async () => {
    const res = await ctx.http.get('/audit?domain=inconnu', 'admin');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });

  it('GET /audit?action= : filtre exact sur une action du catalogue', async () => {
    const actions = await ctx.http.get('/audit/actions', 'admin');
    const action = actions.body.items[0] as string;
    const res = await ctx.http.get(`/audit?action=${action}&limit=100`, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.items.every((entry: { action: string }) => entry.action === action)).toBe(true);
  });

  it('GET /audit/actions : liste des actions présentes', async () => {
    const res = await ctx.http.get('/audit/actions', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, auditActions);
  });

  it('GET /audit/export : CSV lisible (en-têtes d’écran, dates JJ/MM/AAAA HH:MM), tracé au journal', async () => {
    const before = new Date();
    const res = await ctx.http.get('/audit/export', 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="journal-audit-\d{4}-\d{2}-\d{2}\.csv"$/);
    const [header, firstLine] = String(res.text).replace(/^﻿/, '').split('\n');
    expect(header).toBe('"Date";"Action";"Description";"Auteur";"Email de l\'auteur";"Bon"');
    expect(firstLine).toMatch(/^"\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}";/);
    expect(res.text).not.toMatch(/rowCount|truncated|"\{/);

    const traced = await ctx.prisma.auditLog.findFirst({ where: { action: 'audit_exported', createdAt: { gte: before } } });
    expect(traced).not.toBeNull();
  });
});
