/**
 * Contrat du pilotage : inventaire du parc prêté (`/api/reporting/inventory`)
 * et indicateurs du tableau de bord (`/api/kpi/*`, exports compris), ouverts
 * à la direction. Le journal d'audit a son propre fichier (audit.contract.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, expectAccessRule, IT, IT_AND_DIRECTION, rule } from './support/access';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { expectShape } from './support/shape';
import { kpiDelais, kpiIncidents, kpiList, kpiParc, kpiToday } from './shapes/kpi';
import { inventoryByCollaborateur, inventoryList, inventorySummary } from './shapes/reporting';
import { INVENTORY_EXPORT_LIMIT_ENV } from '../../src/reporting/inventory-export-limit';

/** Ce que lisent les cartes comparées à leur liste. */
interface KpiBody {
  signatureMode: Record<'remote' | 'inPerson' | 'proxy', { current: number }>;
  contestations: Record<'founded' | 'notRetained', { current: number }>;
}

/** Valeur (4e colonne) de la ligne « rubrique ; indicateur » d'un export
 *  d'indicateurs (cellules entre guillemets, séparées par des points-virgules). */
function csvValue(csv: unknown, rubrique: string, indicateur: string): string | undefined {
  const prefix = `"${rubrique}";"${indicateur}";`;
  const line = String(csv).split(/\r?\n/).find((l) => l.replace(/^\uFEFF/, '').startsWith(prefix));
  return line?.split(';')[3]?.replace(/^"|"$/g, '');
}

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
  rule('GET /kpi/parc/export', IT_AND_DIRECTION),
  rule('GET /kpi/delais/export', IT_AND_DIRECTION),
  rule('GET /kpi/incidents/export', IT_AND_DIRECTION),
  rule('GET /kpi/delais', IT_AND_DIRECTION),
  rule('GET /kpi/incidents', IT_AND_DIRECTION),
  rule('GET /kpi/aujourdhui', IT),
  rule('GET /kpi/liste', IT, () => '/kpi/liste?indicateur=bons_crees'),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Inventaire', () => {
  it('GET /reporting/inventory : forme unique des listes, plafond d’export dans meta', async () => {
    const res = await ctx.http.get('/reporting/inventory?page=1&limit=25', 'direction');
    expect(res.status).toBe(200);
    expectShape(res.body, inventoryList);
    expect(res.body).toMatchObject({ page: 1, limit: 25, truncated: false, meta: { exportLimit: 10000 } });
  });

  it('GET /reporting/inventory sans pagination : page 1 de 25 lignes', async () => {
    const res = await ctx.http.get('/reporting/inventory', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 25 });
  });

  it.each(['20', '1', '500'])('GET /reporting/inventory?limit=%s : 400 validation_failed, jamais corrigé', async (limit) => {
    const res = await ctx.http.get(`/reporting/inventory?limit=${limit}`, 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect((res.body as { code: string }).code).toBe('validation_failed');
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
      ctx.http.get('/reporting/inventory?situation=non_restitue&limit=25', 'direction'),
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
    expectShape(res.body, apiError);
  });

  it('GET /reporting/inventory avec une limite hors bornes : 400', async () => {
    const res = await ctx.http.get('/reporting/inventory?limit=5000', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it('GET /reporting/inventory/summary : agrégats du parc, « Retour en retard » sous ses deux noms', async () => {
    const res = await ctx.http.get('/reporting/inventory/summary', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, inventorySummary);
    const body = res.body as { overdueReturns: number; overdue: number };
    expect(body.overdue).toBe(body.overdueReturns);
  });

  it('GET /reporting/inventory/summary : overdueReturns = total de la liste filtrée « Retour en retard »', async () => {
    const [summary, list] = await Promise.all([
      ctx.http.get('/reporting/inventory/summary', 'admin'),
      ctx.http.get('/reporting/inventory?overdue=1&limit=25', 'admin'),
    ]);
    expect((summary.body as { overdueReturns: number }).overdueReturns).toBe((list.body as { total: number }).total);
  });

  it.each(['/reporting/inventory/by-collaborateur?limit=25', '/reporting/inventory/by-collaborateur?compte=inactif&limit=25'])(
    'GET %s : forme unique des listes',
    async (path) => {
      const res = await ctx.http.get(path, 'admin');
      expect(res.status).toBe(200);
      expectShape(res.body, inventoryByCollaborateur);
      // Ancien nom servi pendant la vague 3, toujours égal au nouveau.
      for (const item of (res.body as { items: { overdueReturns: number; overdueCount: number }[] }).items) {
        expect(item.overdueCount).toBe(item.overdueReturns);
      }
    },
  );

  it('GET /reporting/inventory/export : fichier CSV daté, en-têtes lisibles par le navigateur', async () => {
    const res = await ctx.http.get('/reporting/inventory/export', 'direction');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="inventaire-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['access-control-expose-headers']).toContain('X-Truncated');
    expect(res.headers['x-truncated']).toBeUndefined();
  });

  it('GET /reporting/inventory/export : fichier coupé au plafond → X-Truncated, plafond annoncé par la liste', async () => {
    const previous = process.env[INVENTORY_EXPORT_LIMIT_ENV];
    process.env[INVENTORY_EXPORT_LIMIT_ENV] = '1';
    try {
      const [file, list] = await Promise.all([
        ctx.http.get('/reporting/inventory/export', 'admin'),
        ctx.http.get('/reporting/inventory?limit=25', 'admin'),
      ]);
      expect((list.body as { total: number }).total).toBeGreaterThan(1);
      expect((list.body as { meta: { exportLimit: number } }).meta.exportLimit).toBe(1);
      expect(file.headers['x-truncated']).toBe('true');
      expect(String(file.text).trim().split('\n')).toHaveLength(2);
    } finally {
      if (previous === undefined) delete process.env[INVENTORY_EXPORT_LIMIT_ENV];
      else process.env[INVENTORY_EXPORT_LIMIT_ENV] = previous;
    }
  });

  it('GET /reporting/inventory/export : libellés d’écran, jamais de code ni de valeur négative', async () => {
    const res = await ctx.http.get('/reporting/inventory/export', 'admin');
    const text = String(res.text);
    for (const code of ['en_circulation', 'en_attente_signature', 'sent_mise_dispo', 'pc_portable']) {
      expect(text).not.toContain(`"${code}"`);
    }
    expect(text).not.toMatch(/"'?-\d/);
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
    const list = await ctx.http.get('/bons?overdue=1&limit=25', 'admin');
    expect(list.status).toBe(200);
    expect((today.body as { overdueSignatures: number }).overdueSignatures).toBe((list.body as { total: number }).total);
  });

  it('GET /kpi/aujourdhui : « Retour en retard » = inventaire filtré', async () => {
    const today = await ctx.http.get('/kpi/aujourdhui', 'admin');
    const list = await ctx.http.get('/reporting/inventory?overdue=1&limit=25', 'admin');
    expect((today.body as { overdueReturns: { equipments: number } }).overdueReturns.equipments)
      .toBe((list.body as { total: number }).total);
  });

  it('GET /kpi/aujourdhui : « Restitution partielle à signer » = liste GET /bons?subStatus=partial_restitution_to_sign', async () => {
    const today = await ctx.http.get('/kpi/aujourdhui', 'technician');
    const list = await ctx.http.get('/bons?subStatus=partial_restitution_to_sign&limit=100', 'technician');
    expect(list.status).toBe(200);
    const section = (today.body as { toDo: { partialRestitutionsToSign: { total: number; rows: { bonId: string }[] } } })
      .toDo.partialRestitutionsToSign;
    // `items` (forme unique) ou `bons` (ancienne forme), le temps que /bons passe à l'enveloppe.
    const body = list.body as { total: number; items?: { id: string }[]; bons?: { id: string }[] };
    const listed = { total: body.total, bons: body.items ?? body.bons ?? [] };
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

  it.each([
    ['signatures_a_distance', '/kpi/delais', (b: KpiBody) => b.signatureMode.remote.current],
    ['signatures_sur_place', '/kpi/delais', (b: KpiBody) => b.signatureMode.inPerson.current],
    ['signatures_mandatees', '/kpi/delais', (b: KpiBody) => b.signatureMode.proxy.current],
    ['contestations_fondees', '/kpi/incidents', (b: KpiBody) => b.contestations.founded.current],
    ['contestations_non_retenues', '/kpi/incidents', (b: KpiBody) => b.contestations.notRetained.current],
  ] as const)('GET /kpi/liste?indicateur=%s : autant de lignes que la carte', async (key, route, card) => {
    const [list, tab] = await Promise.all([
      ctx.http.get(`/kpi/liste?indicateur=${key}&limit=200`, 'admin'),
      ctx.http.get(route, 'admin'),
    ]);
    expect(list.status).toBe(200);
    const body = list.body as { total: number; items: unknown[] };
    // Le jeu de données n'a pas de ligne pour chaque chiffre : forme vérifiée quand il y en a.
    if (body.total > 0) expectShape(list.body, kpiList);
    expect(body.total).toBe(card(tab.body as KpiBody));
    expect(body.items).toHaveLength(body.total);
  });

  it('GET /kpi/delais : « Signature en retard » sous son nom, l’ancien gardé pendant la vague', async () => {
    const res = await ctx.http.get('/kpi/delais', 'admin');
    const { waiting } = res.body as {
      waiting: { overdueSignatures: number; overdueTotal: number; steps: { overdueSignatures: number; overdue: number }[] };
    };
    expect(waiting.overdueTotal).toBe(waiting.overdueSignatures);
    expect(waiting.overdueSignatures).toBe(waiting.steps.reduce((sum, s) => sum + s.overdueSignatures, 0));
    for (const step of waiting.steps) expect(step.overdue).toBe(step.overdueSignatures);
  });

  it('GET /kpi/liste : meta = indicateur et période', async () => {
    const res = await ctx.http.get('/kpi/liste?indicateur=bons_crees&from=2026-01-01&to=2026-12-31&limit=25', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1, limit: 25, truncated: false, meta: { indicateur: 'bons_crees', period: { from: '2026-01-01', to: '2026-12-31' } },
    });
  });

  it('GET /kpi/liste?limit=10 : 400', async () => {
    const res = await ctx.http.get('/kpi/liste?indicateur=bons_crees&limit=10', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it.each(['parc', 'delais', 'incidents'])('GET /kpi/%s/export : CSV de l’onglet, période et filiale gardées', async (tab) => {
    const res = await ctx.http.get(`/kpi/${tab}/export?from=2026-09-01&to=2026-09-30&filialeId=${ctx.data.filialeId}`, 'direction');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="indicateurs-${tab}-2026-09-01-au-2026-09-30.csv"`);
    const text = String(res.text);
    expect(text).toContain('"Période";"";"du 01/09/2026 au 30/09/2026"');
    expect(text).not.toContain('"Filiale";"";"Toutes les filiales"');
    expect(text).not.toMatch(/"'?-\d/);
  });

  it('GET /kpi/*/export : mêmes chiffres que l’onglet, sans identifiant de bon pour la direction', async () => {
    const query = `from=2026-09-01&to=2026-09-30&filialeId=${ctx.data.filialeId}`;
    const [parc, parcCsv, delais, delaisCsv, incidents, incidentsCsv] = await Promise.all([
      ctx.http.get(`/kpi/parc?${query}`, 'direction'),
      ctx.http.get(`/kpi/parc/export?${query}`, 'direction'),
      ctx.http.get(`/kpi/delais?${query}`, 'direction'),
      ctx.http.get(`/kpi/delais/export?${query}`, 'direction'),
      ctx.http.get(`/kpi/incidents?${query}`, 'direction'),
      ctx.http.get(`/kpi/incidents/export?${query}`, 'direction'),
    ]);
    const parcBody = parc.body as { loaned: { total: number; bons: number }; returnOverdue: { equipments: number; top: { bonId: string }[] } };
    expect(csvValue(parcCsv.text, 'Parc prêté', 'Équipements chez les collaborateurs')).toBe(String(parcBody.loaned.total));
    expect(csvValue(parcCsv.text, 'Parc prêté', 'Bons concernés')).toBe(String(parcBody.loaned.bons));
    expect(csvValue(parcCsv.text, 'Retour en retard', 'Équipements en retour en retard')).toBe(String(parcBody.returnOverdue.equipments));
    for (const row of parcBody.returnOverdue.top) expect(String(parcCsv.text)).not.toContain(row.bonId);
    const waiting = (delais.body as { waiting: { overdueSignatures: number } }).waiting;
    expect(csvValue(delaisCsv.text, 'Signatures attendues par document', 'Signature en retard')).toBe(String(waiting.overdueSignatures));
    const toProcess = (incidents.body as { contestations: { toProcess: number } }).contestations.toProcess;
    expect(csvValue(incidentsCsv.text, 'Contestations', 'Contestations à traiter')).toBe(String(toProcess));
  });

  it('GET /kpi/parc/export avec une période invalide : 400', async () => {
    const res = await ctx.http.get('/kpi/parc/export?from=2026-13-40', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it('GET /kpi/liste avec un indicateur inconnu : 400', async () => {
    const res = await ctx.http.get('/kpi/liste?indicateur=bons_perdus', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it('GET /kpi/parc avec une période invalide : 400', async () => {
    const res = await ctx.http.get('/kpi/parc?from=2026-13-40', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });
});
