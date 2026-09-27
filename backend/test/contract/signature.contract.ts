/**
 * Contrat de la page de signature par lien (`/api/signature/:token`) : chaque
 * état possible du lien, l'aperçu du document et les erreurs de signature.
 * Le parcours de signature réussie est couvert par bon-workflow.contract.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { PENDING_REMISE_TOKEN, PENDING_RESTITUTION_TOKEN, SIGNED_TOKEN } from './support/fixtures';
import type { Caller } from './support/http';
import { expectShape } from './support/shape';
import {
  requestNewLink,
  signatureAlreadySigned,
  signatureBonClosed,
  signatureExpired,
  signaturePending,
  signatureReplaced,
  signatureUnauthorized,
} from './shapes/workflow';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jeton du lien (non signé) d'un bon du jeu de données, après avoir
 *  éventuellement fixé sa date d'expiration. */
async function tokenOf(bonId: string, tokenExpiresAt?: Date): Promise<string> {
  const signature = await ctx.prisma.signature.findFirstOrThrow({
    where: { bonId, signed: false, type: { not: 'it_cachet' } },
  });
  if (tokenExpiresAt) {
    await ctx.prisma.signature.update({ where: { id: signature.id }, data: { tokenExpiresAt } });
  }
  return signature.token;
}

describe('GET /signature/:token — un état par forme de réponse', () => {
  it('401 sans session', async () => {
    const res = await ctx.http.get(`/signature/${PENDING_REMISE_TOKEN}`, 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, nestError);
  });

  it('jeton inconnu : 404', async () => {
    const res = await ctx.http.get('/signature/jeton-inconnu', 'collaborator');
    expect(res.status).toBe(404);
    expectShape(res.body, nestError);
  });

  const cases: readonly [string, string, Caller, (body: unknown) => void][] = [
    ['en attente, destinataire', PENDING_REMISE_TOKEN, 'collaborator', (b) => expectShape(b, signaturePending)],
    ['restitution en attente, destinataire', PENDING_RESTITUTION_TOKEN, 'collaborator', (b) => expectShape(b, signaturePending)],
    ['autre compte que le destinataire', PENDING_REMISE_TOKEN, 'otherCollaborator', (b) => expectShape(b, signatureUnauthorized)],
    ['autre compte, même IT', PENDING_REMISE_TOKEN, 'technician', (b) => expectShape(b, signatureUnauthorized)],
    ['déjà signé', SIGNED_TOKEN, 'collaborator', (b) => expectShape(b, signatureAlreadySigned)],
  ];

  it.each(cases)('%s', async (_label, token, caller, expectBody) => {
    const res = await ctx.http.get(`/signature/${token}`, caller);
    expect(res.status).toBe(200);
    expectBody(res.body);
  });

  it('bon contesté : { status: contested, reference }', async () => {
    const token = await tokenOf(ctx.data.bons.contested.id);
    const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signatureBonClosed);
  });

  it('lien expiré : { status: expired, reference }', async () => {
    const token = await tokenOf(ctx.data.bons.sentRestitution.id, new Date(Date.now() - DAY_MS));
    const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signatureExpired);
  });

  it('lien remplacé par un plus récent : { status: replaced, reference, invalidatedReason }', async () => {
    const token = await tokenOf(ctx.data.bons.sentRestitution.id, new Date(0));
    const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signatureReplaced);
    expect(res.body.invalidatedReason).toBe('replaced');
  });

  it('lien invalidé pour une signature au guichet : le vrai motif (R-038)', async () => {
    const token = await tokenOf(ctx.data.bons.sentRestitution.id);
    await ctx.prisma.signature.update({
      where: { token },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: new Date(), invalidatedReason: 'in_person' },
    });
    const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expectShape(res.body, signatureReplaced);
    expect(res.body.invalidatedReason).toBe('in_person');
  });
});

describe('GET /signature/:token/preview', () => {
  it('document PDF affiché dans le navigateur', async () => {
    const res = await ctx.http.get(`/signature/${PENDING_REMISE_TOKEN}/preview`, 'collaborator');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="[^"]+\.pdf"$/);
  });

  it('autre compte que le destinataire : refusé au format NestJS', async () => {
    const res = await ctx.http.get(`/signature/${PENDING_REMISE_TOKEN}/preview`, 'otherCollaborator');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectShape(res.body, nestError);
  });
});

describe('POST /signature/:token/sign — erreurs', () => {
  it('401 sans session', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/sign`, 'anonymous', {});
    expect(res.status).toBe(401);
    expectShape(res.body, nestError);
  });

  it('corps invalide : 400 du ValidationPipe', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/sign`, 'collaborator', {
      signatureDataUrl: 'pas une image',
      mentionLuApprouve: true,
    });
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('lien déjà signé : refusé au format NestJS', async () => {
    const res = await ctx.http.post(`/signature/${SIGNED_TOKEN}/sign`, 'collaborator', {
      signatureDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      mentionLuApprouve: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectShape(res.body, nestError);
  });
});

describe('POST /signature/:token/request-new-link — lien expiré (R-058)', () => {
  it('prévient l’équipe informatique, puis « déjà demandé » pendant 24 h', async () => {
    const token = await tokenOf(ctx.data.bons.sentRestitution.id, new Date(Date.now() - DAY_MS));
    const first = await ctx.http.post(`/signature/${token}/request-new-link`, 'collaborator', {});
    expect(first.status).toBe(200);
    expectShape(first.body, requestNewLink);
    expect(first.body.status).toBe('requested');

    const again = await ctx.http.post(`/signature/${token}/request-new-link`, 'collaborator', {});
    expectShape(again.body, requestNewLink);
    expect(again.body.status).toBe('already_requested');

    const info = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expectShape(info.body, signatureExpired);
    expect(info.body.newLinkRequestedAt).toBe(first.body.requestedAt);
  });

  it('lien encore valable : 400 au format NestJS', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/request-new-link`, 'collaborator', {});
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('autre compte : 403, sans l’adresse du destinataire (R-039)', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/request-new-link`, 'otherCollaborator', {});
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('401 sans session', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/request-new-link`, 'anonymous', {});
    expect(res.status).toBe(401);
  });
});

describe('POST /signature/:token/sign — refus d’un autre compte (R-039)', () => {
  it('403 sans révéler l’adresse du destinataire', async () => {
    const res = await ctx.http.post(`/signature/${PENDING_REMISE_TOKEN}/sign`, 'otherCollaborator', {
      signatureDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      mentionLuApprouve: true,
    });
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });
});
