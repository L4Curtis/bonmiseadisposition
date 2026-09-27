/**
 * Contrat des pièces jointes d'un bon (`/api/bons/:bonId/attachments`) :
 * liste, ajout (multipart), téléchargement et suppression, pour l'IT et pour
 * le collaborateur titulaire pendant la période de signature.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nestError, ok } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import type { Caller } from './support/http';
import { arrayOf, expectShape } from './support/shape';
import { attachment } from './shapes/workflow';

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

function upload(bonId: string, caller: Caller, stage = 'mise_disposition') {
  return ctx.http
    .send('post', `/bons/${bonId}/attachments`, caller)
    .field('stage', stage)
    .field('label', 'Photo de l’état du matériel')
    .attach('file', PNG_1PX, { filename: 'etat.png', contentType: 'image/png' });
}

describe('Droits d’accès (titulaire ou IT)', () => {
  it.each([
    ['anonymous', 401],
    ['otherCollaborator', 403],
    ['direction', 403],
  ] as const)('GET /bons/:bonId/attachments par %s → %i', async (caller, status) => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.sentMiseDispo.id}/attachments`, caller);
    expect(res.status).toBe(status);
    expectShape(res.body, nestError);
  });
});

describe('Cycle d’une pièce jointe', () => {
  let attachmentId = '';

  it('POST /bons/:bonId/attachments (multipart) par le titulaire : 201 et les métadonnées', async () => {
    const res = await upload(ctx.data.bons.sentMiseDispo.id, 'collaborator');
    expect(res.status).toBe(201);
    expectShape(res.body, attachment);
    attachmentId = res.body.id;
  });

  it('GET /bons/:bonId/attachments : tableau nu des métadonnées', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.sentMiseDispo.id}/attachments`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(attachment, { minLength: 1 }));
  });

  it('GET /bons/:bonId/attachments/:id : le fichier, image affichée en ligne', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.sentMiseDispo.id}/attachments/${attachmentId}`, 'collaborator');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="[^"]+"$/);
  });

  it('DELETE /bons/:bonId/attachments/:id : { ok: true }', async () => {
    const res = await ctx.http.delete(`/bons/${ctx.data.bons.sentMiseDispo.id}/attachments/${attachmentId}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, ok);
  });

  it('ajout par le titulaire hors période de signature : 403', async () => {
    const res = await upload(ctx.data.bons.archived.id, 'collaborator');
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
  });
});

/**
 * Étape d'une pièce jointe : pour le collaborateur, le serveur la déduit du
 * document qui attend sa signature et ignore celle envoyée ; l'IT choisit.
 */
describe('Étape de la pièce jointe', () => {
  it.each([
    ['sentMiseDispo', 'mise_disposition'],
    ['sentRestitution', 'restitution'],
  ] as const)('titulaire sur le bon %s : étape « %s », quelle que soit celle envoyée', async (key, expected) => {
    const res = await upload(ctx.data.bons[key].id, 'collaborator', 'pv_cloture');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectShape(res.body, attachment);
    expect(res.body.stage).toBe(expected);
    const stored = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.stage).toBe(expected);
  });

  it('IT : l’étape envoyée est gardée', async () => {
    const res = await upload(ctx.data.bons.sentMiseDispo.id, 'technician', 'general');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.stage).toBe('general');
  });

  it('titulaire, bon passé hors période de signature : 403 et aucune pièce enregistrée', async () => {
    const before = await ctx.prisma.attachment.count({ where: { bonId: ctx.data.bons.active.id } });
    const res = await upload(ctx.data.bons.active.id, 'collaborator');
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
    expect(await ctx.prisma.attachment.count({ where: { bonId: ctx.data.bons.active.id } })).toBe(before);
  });
});
