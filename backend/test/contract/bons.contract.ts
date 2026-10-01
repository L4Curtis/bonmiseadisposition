/**
 * Contrat des lectures sur les bons : liste, fiche, tableau de bord, portail
 * collaborateur, emails, intégrité, documents PDF et export CSV.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, EVERY_ROLE, expectAccessRule, IT, rule } from './support/access';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { PENDING_REMISE_TOKEN } from './support/fixtures';
import type { Caller } from './support/http';
import { expectShape } from './support/shape';
import {
  bonDetail,
  bonHistory,
  bonIntegrity,
  bonList,
  bonNotifications,
  bonStats,
  missingPdfSnapshots,
  myBons,
  pdfSnapshots,
} from './shapes/bons';

const UNKNOWN_BON = '00000000-0000-4000-8000-000000000000';

/** Jour civil de Paris (AAAA-MM-JJ), `days` jours avant maintenant. */
function parisDay(daysAgo = 0): string {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(at);
}

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Routes réservées à l'IT, et `/me/bons`, ouverte à tous les rôles (chacun
 *  peut recevoir du matériel) ; les anciens chemins (alias dépréciés) suivent
 *  les droits du nouveau. Les routes « propriétaire » (un bon précis) sont
 *  vérifiées à part, plus bas. */
const ACCESS: readonly AccessRule[] = [
  rule('GET /bons', IT),
  rule('GET /bons/stats', IT),
  rule('GET /bons/recent', IT),
  rule('GET /bons/export', IT),
  rule('GET /me/bons', EVERY_ROLE),
  rule('GET /bons/mes-bons', EVERY_ROLE),
  rule('GET /bons/:id/history', IT, (d) => `/bons/${d.bons.draft.id}/history`),
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
    if (status >= 400) expectShape(res.body, apiError);
  });
});

/**
 * Un brouillon n'existe pas encore pour le collaborateur : ses routes
 * « propriétaire » répondent 404, exactement comme pour un bon inconnu ;
 * l'IT, elle, le voit.
 */
describe.each([
  ['GET /bons/:id', (id: string) => `/bons/${id}`],
  ['GET /bons/:id/integrity', (id: string) => `/bons/${id}/integrity`],
  ['GET /bons/:id/pdf-snapshots', (id: string) => `/bons/${id}/pdf-snapshots`],
  ['GET /bons/:id/pdf', (id: string) => `/bons/${id}/pdf`],
  ['GET /bons/:bonId/attachments', (id: string) => `/bons/${id}/attachments`],
])('%s — brouillon invisible pour le collaborateur', (_route, pathOf) => {
  it.each(['collaborator', 'otherCollaborator', 'direction'] as const)('%s → 404', async (caller) => {
    const res = await ctx.http.get(pathOf(ctx.data.bons.draft.id), caller);
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
  });

  it('technicien → 200', async () => {
    const res = await ctx.http.get(pathOf(ctx.data.bons.draft.id), 'technician');
    expect(res.status).toBe(200);
  });
});

describe('GET /bons/:id — brouillon et bon inconnu, même réponse pour le titulaire', () => {
  it('même statut et même message', async () => {
    const draft = await ctx.http.get(`/bons/${ctx.data.bons.draft.id}`, 'collaborator');
    const unknown = await ctx.http.get(`/bons/${UNKNOWN_BON}`, 'collaborator');
    expect(unknown.status).toBe(404);
    expect(draft.status).toBe(unknown.status);
    expect(draft.body.message).toBe(unknown.body.message);
  });
});

describe('Liste et tableau de bord', () => {
  it('GET /bons : forme commune des listes { items, total, page, limit, truncated }, 25 par défaut', async () => {
    const res = await ctx.http.get('/bons', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonList);
    expect(res.body).toMatchObject({ page: 1, limit: 25, truncated: false, meta: { exportLimit: 5000 } });
  });

  it.each(['25', '50', '100'])('GET /bons?limit=%s : taille de page acceptée', async (limit) => {
    const res = await ctx.http.get(`/bons?page=1&limit=${limit}`, 'technician');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(Number(limit));
  });

  it.each(['5', '20', '500'])('GET /bons?limit=%s : 400 validation_failed, jamais corrigé en silence', async (limit) => {
    const res = await ctx.http.get(`/bons?limit=${limit}`, 'technician');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('validation_failed');
  });

  it('GET /bons : les filtres du front (statuts multiples, recherche) gardent la forme', async () => {
    const byStatus = await ctx.http.get('/bons?status=sent_mise_dispo,sent_restitution,partially_returned', 'admin');
    expect(byStatus.status).toBe(200);
    expectShape(byStatus.body, bonList);
    expect(byStatus.body.items.map((bon: { status: string }) => bon.status).sort()).toEqual(
      ['partially_returned', 'sent_mise_dispo', 'sent_restitution'],
    );
    const bySearch = await ctx.http.get(`/bons?search=${ctx.data.bons.active.reference}`, 'admin');
    expect(bySearch.status).toBe(200);
    expectShape(bySearch.body, bonList);
    expect(bySearch.body.total).toBe(1);
    expect(bySearch.body.items[0].id).toBe(ctx.data.bons.active.id);
  });

  it('GET /bons?reference= : ce bon seul, jamais ses voisins (référence exacte, casse indifférente)', async () => {
    const { reference, id } = ctx.data.bons.active;
    const exact = await ctx.http.get(`/bons?reference=${reference.toLowerCase()}`, 'technician');
    expect(exact.status).toBe(200);
    expectShape(exact.body, bonList);
    expect(exact.body.items.map((b: { id: string }) => b.id)).toEqual([id]);
    // Une sous-chaîne de référence ne ramène rien : elle n'est pas une référence.
    const prefix = await ctx.http.get(`/bons?reference=${reference.slice(0, -1)}`, 'technician');
    expect(prefix.status).toBe(400);
    expectShape(prefix.body, apiError);
  });

  it('GET /bons : périodes de création et de clôture (jours de Paris), comme les listes du tableau de bord', async () => {
    const created = await ctx.http.get(`/bons?createdFrom=${parisDay()}&createdTo=${parisDay()}&limit=100`, 'technician');
    expect(created.status).toBe(200);
    expect(created.body.total).toBeGreaterThan(0);
    const before = await ctx.http.get(`/bons?createdTo=${parisDay(2)}`, 'technician');
    expect(before.body.total).toBe(0);

    const closed = await ctx.http.get(`/bons?closedFrom=${parisDay(1)}&closedTo=${parisDay(1)}`, 'technician');
    expect(closed.status).toBe(200);
    expectShape(closed.body, bonList);
    expect(closed.body.items.map((b: { id: string }) => b.id)).toContain(ctx.data.bons.archived.id);
    expect(closed.body.items.every((b: { status: string }) => b.status === 'archived')).toBe(true);
  });

  it('GET /bons : période d’annulation lue dans le journal (un bon annulé sans trace n’y figure pas)', async () => {
    const res = await ctx.http.get(`/bons?cancelledFrom=${parisDay(7)}`, 'technician');
    expect(res.status).toBe(200);
    expect(res.body.items.map((b: { id: string }) => b.id)).not.toContain(ctx.data.bons.cancelled.id);
  });

  it('GET /bons : une période dont le début suit la fin est refusée (400)', async () => {
    const res = await ctx.http.get(`/bons?closedFrom=${parisDay()}&closedTo=${parisDay(3)}`, 'technician');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it('GET /bons : un bon envoyé porte sa signature en attente (relances de la liste)', async () => {
    const res = await ctx.http.get(`/bons?reference=${ctx.data.bons.sentMiseDispo.reference}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonList);
    expect(res.body.items[0].signatures).toEqual([
      { type: 'mise_disposition', signed: false, createdAt: expect.stringMatching(/Z$/) },
    ]);
  });

  it('GET /bons/stats : compteurs du tableau de bord', async () => {
    const res = await ctx.http.get('/bons/stats', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, bonStats);
  });

  it('GET /bons/recent : ancien chemin de la liste, même réponse, avec Deprecation et Link', async () => {
    const current = await ctx.http.get('/bons?limit=25', 'admin');
    const legacy = await ctx.http.get('/bons/recent?limit=25', 'admin');
    expect(legacy.status).toBe(200);
    expectShape(legacy.body, bonList);
    expect(legacy.body).toEqual(current.body);
    expect(legacy.headers.deprecation).toBe('true');
    expect(legacy.headers.link).toBe('</api/bons>; rel="successor-version"');
    expect(current.headers.deprecation).toBeUndefined();
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

  it('GET /bons/:id : jamais le `stampPath` de la filiale (le PDF lit le cachet par `filialeId`)', async () => {
    const forIt = await ctx.http.get(`/bons/${ctx.data.bons.active.id}`, 'technician');
    expect(forIt.body.filiale.id).toEqual(expect.any(String));
    expect(forIt.body.filiale).not.toHaveProperty('stampPath');
    const forOwner = await ctx.http.get(`/bons/${ctx.data.bons.active.id}`, 'collaborator');
    expect(forOwner.status).toBe(200);
    expectShape(forOwner.body, bonDetail);
    expect(forOwner.body.filiale).not.toHaveProperty('stampPath');
  });

  it('GET /bons/:id/history : qui, quoi, quand, avec la phrase du catalogue et sans donnée technique', async () => {
    const { draft } = ctx.data.bons;
    const res = await ctx.http.get(`/bons/${draft.id}/history`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonHistory);
    expect(res.body.items[0]).toMatchObject({
      action: 'bon_created',
      label: 'Bon créé',
      actorName: expect.any(String),
      sentence: expect.stringContaining(`a créé le bon ${draft.reference}`),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ipAddress|userAgent|details/);
  });

  it('GET /bons/:id/history : bon inconnu → 404 à la forme unique', async () => {
    const res = await ctx.http.get(`/bons/${UNKNOWN_BON}/history`, 'technician');
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('not_found');
  });

  it('GET /bons/:id/notifications : emails du bon, forme commune des listes', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/notifications`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonNotifications);
  });

  it('GET /bons/:id/integrity : sceaux des signatures', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}/integrity`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, bonIntegrity);
  });

  it('GET /bons/:id/integrity : bon inconnu → 404 not_found (et non une vérification vide)', async () => {
    const res = await ctx.http.get(`/bons/${UNKNOWN_BON}/integrity`, 'admin');
    expect(res.status).toBe(404);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('not_found');
  });

  it('GET /bons/:id/pdf-snapshots : documents du bon, forme commune des listes', async () => {
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
    expectShape(res.body, apiError);
  });
});

describe('Portail collaborateur', () => {
  it('GET /me/bons : bons du collaborateur connecté, forme commune des listes', async () => {
    const res = await ctx.http.get('/me/bons', 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, myBons);
    expect(res.body.truncated).toBe(false);
    const ids = (res.body.items as { id: string }[]).map((bon) => bon.id);
    expect(ids).not.toContain(ctx.data.bons.otherCollaboratorActive.id);
  });

  it('GET /me/bons : le lien « Signer » porte le jeton du seul document en attente', async () => {
    const res = await ctx.http.get('/me/bons', 'collaborator');
    expect(res.status).toBe(200);
    const bons = res.body.items as { id: string; signatures: { type: string; signed: boolean; token?: string }[] }[];
    const sent = bons.find((bon) => bon.id === ctx.data.bons.sentMiseDispo.id);
    const pending = sent?.signatures.find((s) => s.type === 'mise_disposition' && !s.signed);
    expect(pending?.token).toBe(PENDING_REMISE_TOKEN);
    const signedWithToken = bons.flatMap((bon) => bon.signatures).filter((s) => s.signed && s.token !== undefined);
    expect(signedWithToken).toEqual([]);
  });

  it('GET /bons/mes-bons : ancien chemin, même réponse, avec Deprecation et Link', async () => {
    const current = await ctx.http.get('/me/bons', 'collaborator');
    const legacy = await ctx.http.get('/bons/mes-bons', 'collaborator');
    expect(legacy.status).toBe(200);
    expect(legacy.body).toEqual(current.body);
    expect(legacy.headers.deprecation).toBe('true');
    expect(legacy.headers.link).toBe('</api/me/bons>; rel="successor-version"');
  });
});

describe('Export CSV', () => {
  it('GET /bons/export : fichier CSV nommé par le serveur', async () => {
    const res = await ctx.http.get('/bons/export?status=active', 'technician');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="bons-export-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['x-truncated']).toBeUndefined();
    // Le navigateur doit pouvoir lire le nom du fichier et la troncature.
    expect(res.headers['access-control-expose-headers']).toContain('X-Truncated');
  });

  it('GET /bons/export?ids= : export de la sélection, nommé comme tel', async () => {
    const res = await ctx.http.get(`/bons/export?ids=${ctx.data.bons.active.id}`, 'technician');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/filename="bons-selection-\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});
