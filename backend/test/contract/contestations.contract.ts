/**
 * Contrat des contestations (`/api/contestations`) : liste de l'écran IT et
 * compteur du menu, droits de la création par le collaborateur. La prise en
 * charge et la clôture sont vérifiées par bon-workflow.contract.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, expectAccessRule, IT, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { expectShape } from './support/shape';
import { contestationList, resolveContestation } from './shapes/workflow';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

async function openContestationId(): Promise<string> {
  const contestation = await ctx.prisma.contestation.findFirstOrThrow({ where: { status: 'open' } });
  return contestation.id;
}

const ACCESS: readonly AccessRule[] = [
  rule('GET /contestations', IT),
  rule('PATCH /contestations/:id/review', IT, () => '/contestations/00000000-0000-4000-8000-000000000000/review'),
  rule('PATCH /contestations/:id/resolve', IT, () => '/contestations/00000000-0000-4000-8000-000000000000/resolve'),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Liste', () => {
  it('GET /contestations : { contestations, total, page, limit, openCount }', async () => {
    const res = await ctx.http.get('/contestations?page=1&limit=20', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, contestationList);
  });

  it('GET /contestations?status=open&limit=1 (compteur du menu) : même forme', async () => {
    const res = await ctx.http.get('/contestations?status=open&limit=1', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, contestationList);
    expect(res.body.openCount).toBeGreaterThanOrEqual(1);
  });
});

describe('Création par le collaborateur', () => {
  it('POST /bons/:id/contestation sans session : 401', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'anonymous', { message: 'x' });
    expect(res.status).toBe(401);
    expectShape(res.body, nestError);
  });

  it('POST /bons/:id/contestation sur le bon d’un autre : 403', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'otherCollaborator', {
      message: 'Ce bon n’est pas le mien.',
    });
    expect(res.status).toBe(403);
    expectShape(res.body, nestError);
  });

  it('POST /bons/:id/contestation sur un bon qui n’est plus contestable : refusé au format NestJS', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.archived.id}/contestation`, 'collaborator', {
      message: 'Trop tard.',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectShape(res.body, nestError);
  });
});

describe('Clôture directe d’une contestation ouverte', () => {
  it('PATCH /contestations/:id/resolve (acceptation sans correction) : correctedBon à null', async () => {
    const res = await ctx.http.patch(`/contestations/${await openContestationId()}/resolve`, 'admin', {
      action: 'resolved',
      resolutionMessage: 'Écran remplacé.',
    });
    expect(res.status).toBe(200);
    expectShape(res.body, resolveContestation);
    expect(res.body.correctedBon).toBeNull();
  });
});
