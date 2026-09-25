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

function upload(bonId: string, caller: Caller) {
  return ctx.http
    .send('post', `/bons/${bonId}/attachments`, caller)
    .field('stage', 'mise_disposition')
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
