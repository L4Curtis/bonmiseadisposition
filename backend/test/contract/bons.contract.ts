/**
 * Contrat des lectures sur les bons : liste, fiche, tableau de bord, portail
 * collaborateur, emails, intégrité, documents PDF et export CSV.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, EVERY_ROLE, expectAccessRule, IT, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { PENDING_REMISE_TOKEN } from './support/fixtures';
import type { Caller } from './support/http';
import { expectShape } from './support/shape';
import {
  bonDetail,
  bonIntegrity,
  bonList,
  bonNotifications,
  bonStats,
  missingPdfSnapshots,
  myBons,
  pdfSnapshots,
  recentBons,
} from './shapes/bons';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Routes réservées à l'IT, et `mes-bons`, ouverte à tous les rôles (chacun
 *  peut recevoir du matériel). Les routes « propriétaire » (un bon précis)
 *  sont vérifiées à part, plus bas. */
const ACCESS: readonly AccessRule[] = [
  rule('GET /bons', IT),
  rule('GET /bons/stats', IT),
  rule('GET /bons/recent', IT),
  rule('GET /bons/export', IT),
  rule('GET /bons/mes-bons', EVERY_ROLE),
  rule('GET /bons/:id/pdf-snapshots/missing', IT, (d) => `/bons/${d.bons.active.id}/pdf-snapshots/missing`),
  rule('GET /bons/:id/notifications', IT, (d) => `/bons/${d.bons.active.id}/notifications`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

/**
 * Routes « propriétaire » : ouvertes à tous les rôles par les gardes, puis
 * limitées par le contrôleur au titulaire du bon pour un compte non IT (la
 * direction, qui n'est pas titulaire de ce bon, est donc refusée).
 */
describe.each([
  ['GET /bons/:id', (id: string) => `/bons/${id}`],
  ['GET /bons/:id/integrity', (id: string) => `/bons/${id}/integrity`],
  ['GET /bons/:id/pdf-snapshots', (id: string) => `/bons/${id}/pdf-snapshots`],
  ['GET /bons/:id/pdf', (id: string) => `/bons/${id}/pdf`],
])('%s — titulaire ou IT seulement', (_route, pathOf) => {
  const expectations: readonly [Caller, number][] = [
    ['anonymous', 401],
    ['admin', 200],
    ['technician', 200],
    ['collaborator', 200],
    ['otherCollaborator', 403],
    ['direction', 403],
  ];

  it.each(expectations)('%s → %i', async (caller, status) => {
    const res = await ctx.http.get(pathOf(ctx.data.bons.active.id), caller);
    expect(res.status).toBe(status);
    if (status >= 400) expectShape(res.body, nestError);
  });
});

describe('Liste et tableau de bord', () => {
  it('GET /bons : enveloppe { bons, total, page, limit }', async () => {
    const res = await ctx.http.get('/bons?page=1&limit=5', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonList);
    expect(res.body.limit).toBe(5);
  });

  it('GET /bons : les filtres du front (statuts multiples, recherche) gardent la forme', async () => {
    const byStatus = await ctx.http.get('/bons?status=sent_mise_dispo,sent_restitution,partially_returned', 'admin');
    expect(byStatus.status).toBe(200);
    expectShape(byStatus.body, bonList);
    expect(byStatus.body.bons.map((bon: { status: string }) => bon.status).sort()).toEqual(
      ['partially_returned', 'sent_mise_dispo', 'sent_restitution'],
    );
    const bySearch = await ctx.http.get(`/bons?search=${ctx.data.bons.active.reference}&limit=6`, 'admin');
    expect(bySearch.status).toBe(200);
    expectShape(bySearch.body, bonList);
    expect(bySearch.body.total).toBe(1);
    expect(bySearch.body.bons[0].id).toBe(ctx.data.bons.active.id);
  });

  it('GET /bons : un bon envoyé porte sa signature en attente (relances de la liste)', async () => {
    const res = await ctx.http.get(`/bons?search=${ctx.data.bons.sentMiseDispo.reference}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonList);
    expect(res.body.bons[0].signatures).toEqual([
      { type: 'mise_disposition', signed: false, createdAt: expect.stringMatching(/Z$/) },
    ]);
  });

  it('GET /bons/stats : compteurs du tableau de bord', async () => {
    const res = await ctx.http.get('/bons/stats', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, bonStats);
  });

  it('GET /bons/recent?limit=10 : tableau de fiches complètes', async () => {
    const res = await ctx.http.get('/bons/recent?limit=10', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, recentBons);
  });
});

describe('Fiche d’un bon', () => {
  it('GET /bons/:id : forme BonDetail, équipements et signatures du bon au complet', async () => {
    const { active } = ctx.data.bons;
    const res = await ctx.http.get(`/bons/${active.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonDetail);
    // Une relation vidée par erreur (select, filtre) passerait la forme : le
    // contenu est donc comparé au jeu de données (3 équipements, 2 signatures).
    expect(res.body.equipments.map((e: { id: string }) => e.id)).toEqual(active.equipmentIds);
    expect(res.body.signatures.map((s: { type: string }) => s.type).sort()).toEqual(['it_cachet', 'mise_disposition']);
  });

  it('GET /bons/:id : `stampPath` de la filiale renvoyé à l’IT, retiré pour le titulaire', async () => {
    const forIt = await ctx.http.get(`/bons/${ctx.data.bons.active.id}`, 'technician');
    expect(forIt.body.filiale).toHaveProperty('stampPath');
    const forOwner = await ctx.http.get(`/bons/${ctx.data.bons.active.id}`, 'collaborator');
    expect(forOwner.status).toBe(200);
    expectShape(forOwner.body, bonDetail);
    expect(forOwner.body.filiale).not.toHaveProperty('stampPath');
  });

  it('GET /bons/:id/notifications : emails du bon', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/notifications`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonNotifications);
  });

  it('GET /bons/:id/integrity : sceaux des signatures', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/integrity`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, bonIntegrity);
  });

  it('GET /bons/:id/pdf-snapshots : reste un tableau nu (lu tel quel par le portail)', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/pdf-snapshots`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, pdfSnapshots);
  });

  it('GET /bons/:id/pdf-snapshots/missing : { missing }', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/pdf-snapshots/missing`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, missingPdfSnapshots);
  });

  it('GET /bons/:id/pdf : document PDF en pièce jointe', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/pdf?type=mise_disposition`, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.pdf"$/);
  });

  it('GET /bons/:id/pdf avec un type inconnu : 400', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/pdf?type=inconnu`, 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });
});

describe('Portail collaborateur', () => {
  it('GET /bons/mes-bons : bons du collaborateur connecté, signatures enrichies du lien', async () => {
    const res = await ctx.http.get('/bons/mes-bons', 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, myBons);
    const ids = (res.body as { id: string }[]).map((bon) => bon.id);
    expect(ids).not.toContain(ctx.data.bons.otherCollaboratorActive.id);
  });

  it('GET /bons/mes-bons : le lien « Signer » porte le jeton du seul document en attente', async () => {
    const res = await ctx.http.get('/bons/mes-bons', 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, myBons);
    const bons = res.body as { id: string; signatures: { type: string; signed: boolean; token?: string }[] }[];
    const sent = bons.find((bon) => bon.id === ctx.data.bons.sentMiseDispo.id);
    const pending = sent?.signatures.find((s) => s.type === 'mise_disposition' && !s.signed);
    expect(pending?.token).toBe(PENDING_REMISE_TOKEN);
    const signedWithToken = bons.flatMap((bon) => bon.signatures).filter((s) => s.signed && s.token !== undefined);
    expect(signedWithToken).toEqual([]);
  });
});

describe('Export CSV', () => {
  it('GET /bons/export : fichier CSV nommé par le serveur', async () => {
    const res = await ctx.http.get('/bons/export?status=active', 'technician');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="bons-export-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['x-truncated']).toBeUndefined();
  });
});
