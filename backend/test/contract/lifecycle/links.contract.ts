/**
 * Liens de signature, sur une vraie base : jamais deux liens valides pour le
 * même document, même quand deux gestes se croisent.
 *  - « Renvoyer » cliqué deux fois de suite : un seul lien, un seul email ;
 *    un renvoi confirmé remplace l'ancien lien (motif « remplacé ») ;
 *  - un lien au guichet, un renvoi ou la première émission du PV qui se
 *    croisent laissent un seul lien valide (verrou commun des liens du bon) ;
 *  - une signature ne passe pas sur un lien invalidé pendant qu'elle
 *    s'écrit (bon modifié, marquage annulé…) : le document signé serait
 *    alors différent de celui que le collaborateur a lu.
 */
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BonsService } from '../../../src/bons/bons.service';
import { emitPvClotureIfDue } from '../../../src/bons/workflow/bon-cloture';
import type { BonsWorkflowContext } from '../../../src/bons/workflow/bon-context';
import { invalidatePendingLinks } from '../../../src/bons/workflow/bon-links';
import type { PrismaService } from '../../../src/prisma/prisma.service';
import { ContractContext, startContractContext } from '../support/context';
import { createActiveBon, latestLink, SIGNATURE_PNG, signIt, signLink } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const HOUR_MS = 60 * 60 * 1000;

/** Bon dont la restitution complète attend la signature du collaborateur,
 *  signature IT posée, sans lien encore envoyé. */
async function restitutionReadyToSend(): Promise<string> {
  const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
  const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
    returnedEquipmentIds: bon.equipmentIds,
  });
  expect(marked.status, JSON.stringify(marked.body)).toBe(201);
  await signIt(ctx, bon.id, 'restitution');
  return bon.id;
}

/** Liens du collaborateur encore utilisables (ni signés, ni invalidés, ni expirés). */
function validLinks(bonId: string) {
  return ctx.prisma.signature.findMany({
    where: { bonId, type: { not: 'it_cachet' }, signed: false, invalidatedAt: null, tokenExpiresAt: { gt: new Date() } },
  });
}

describe('Renvoyer le lien : jamais deux liens valides pour le même document', () => {
  it('double clic sur « Renvoyer » : deux réponses 201, un seul lien créé', async () => {
    const bonId = await restitutionReadyToSend();

    const [first, second] = await Promise.all([
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true }),
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true }),
    ]);

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(await validLinks(bonId)).toHaveLength(1);
    expect(await ctx.prisma.signature.count({ where: { bonId, type: 'restitution' } })).toBe(1);
  });

  it('double clic sans confirmation : un envoi (201), l’autre demande confirmation (409), un seul lien', async () => {
    const bonId = await restitutionReadyToSend();

    const responses = await Promise.all([
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', {}),
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', {}),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await validLinks(bonId)).toHaveLength(1);
    expect(await ctx.prisma.signature.count({ where: { bonId, type: 'restitution' } })).toBe(1);
  });

  it('second clic juste après le premier : le lien récent est réutilisé, rien n’est recréé', async () => {
    const bonId = await restitutionReadyToSend();
    expect((await ctx.http.post(`/bons/${bonId}/resend`, 'technician', {})).status).toBe(201);
    const sent = await latestLink(ctx, bonId);

    const again = await ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true });

    expect(again.status, JSON.stringify(again.body)).toBe(201);
    const links = await validLinks(bonId);
    expect(links.map((link) => link.id)).toEqual([sent.id]);
  });

  it('renvoi confirmé d’un lien plus ancien : l’ancien est invalidé « remplacé », le nouveau seul valide', async () => {
    const bonId = await restitutionReadyToSend();
    expect((await ctx.http.post(`/bons/${bonId}/resend`, 'technician', {})).status).toBe(201);
    const old = await latestLink(ctx, bonId);
    await ctx.prisma.signature.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 2 * HOUR_MS) } });

    const res = await ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const replaced = await ctx.prisma.signature.findUniqueOrThrow({ where: { id: old.id } });
    expect(replaced.invalidatedReason).toBe('replaced');
    const links = await validLinks(bonId);
    expect(links).toHaveLength(1);
    expect(links[0].id).not.toBe(old.id);
  });
});

/** Bon dont le PV de non-restitution est dû mais n'est jamais parti : un
 *  équipement perdu (déclaré, signature IT), l'autre rendu et signé au
 *  guichet ; puis le PV émis par la signature est effacé (document et lien),
 *  comme s'il n'avait pas pu partir. */
async function pvDueNeverSent(): Promise<string> {
  const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
  const [kept, lost] = bon.equipmentIds;
  const declared = await ctx.http.post(`/bons/${bon.id}/declare-not-returned`, 'technician', {
    equipmentIds: [lost], reason: 'Perdu en déplacement', signatureDataUrl: SIGNATURE_PNG,
  });
  expect(declared.status, JSON.stringify(declared.body)).toBe(201);
  await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [kept], inPerson: true });
  await signIt(ctx, bon.id, 'restitution');
  const atDesk = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
  expect((await signLink(ctx, atDesk.body.token, 'technician')).status).toBe(200);
  await ctx.prisma.pdfSnapshot.deleteMany({ where: { bonId: bon.id, type: 'cloture_equipements_manquants' } });
  await invalidatePendingLinks(ctx.prisma, bon.id, 'replaced');
  return bon.id;
}

describe('Guichet et renvoi simultanés : un seul lien valide', () => {
  it.each([1, 2, 3])('restitution, essai %i : lien au guichet et renvoi par email en même temps', async () => {
    const bonId = await restitutionReadyToSend();

    const [resent, atDesk] = await Promise.all([
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true }),
      ctx.http.post(`/bons/${bonId}/initiate-inperson`, 'technician', { type: 'restitution' }),
    ]);

    expect(resent.status, JSON.stringify(resent.body)).toBe(201);
    expect(atDesk.status, JSON.stringify(atDesk.body)).toBe(201);
    expect(await validLinks(bonId)).toHaveLength(1);
  });

  it.each([1, 2, 3])('PV de non-restitution, essai %i : première émission par renvoi et lien au guichet en même temps', async () => {
    const bonId = await pvDueNeverSent();

    const [resent, atDesk] = await Promise.all([
      ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true }),
      ctx.http.post(`/bons/${bonId}/initiate-inperson`, 'technician', { type: 'pv_cloture' }),
    ]);

    // Le renvoi arrivé après le lien au guichet trouve un PV déjà émis : 400.
    expect([201, 400], JSON.stringify(resent.body)).toContain(resent.status);
    expect(atDesk.status, JSON.stringify(atDesk.body)).toBe(201);
    const links = await validLinks(bonId);
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('pv_cloture');
  });
});

/**
 * Retarde la validation de la prochaine transaction qui crée un lien de PV
 * par email (juste après sa création) : un geste concurrent qui ne
 * partagerait pas son verrou s'exécuterait pendant ce délai, sans voir le lien.
 */
function delayNextPvEmailLinkCommit(prisma: PrismaService, delayMs: number) {
  const original = prisma.$transaction.bind(prisma) as (fn: unknown, options?: unknown) => Promise<unknown>;
  const slowCreate = (tx: Prisma.TransactionClient): Prisma.TransactionClient =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop !== 'signature') return Reflect.get(target, prop, receiver);
        return {
          ...target.signature,
          create: async (args: Prisma.SignatureCreateArgs) => {
            const created = await target.signature.create(args);
            if (created.type === 'pv_cloture' && !created.isInPerson) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            return created;
          },
        };
      },
    });
  return vi.spyOn(prisma, '$transaction').mockImplementation(((arg: unknown, options?: unknown) =>
    typeof arg === 'function'
      ? original((tx: Prisma.TransactionClient) => (arg as (t: Prisma.TransactionClient) => unknown)(slowCreate(tx)), options)
      : original(arg, options)) as never);
}

describe('Émission du PV et lien au guichet : même verrou', () => {
  it('le lien au guichet attend la fin de l’émission du PV, puis la remplace : un seul lien valide', async () => {
    const bonId = await pvDueNeverSent();
    // PV déjà parti une fois (document présent), lien invalidé : le guichet
    // va droit au lien, et une nouvelle émission reste possible.
    const workflow = (ctx.app.get(BonsService) as unknown as { ctx: BonsWorkflowContext }).ctx;
    await emitPvClotureIfDue(workflow, bonId, undefined, ctx.data.people.technician.id, { sendEmail: false });
    await invalidatePendingLinks(ctx.prisma, bonId, 'replaced');

    const spy = delayNextPvEmailLinkCommit(ctx.prisma, 600);
    try {
      const emission = emitPvClotureIfDue(workflow, bonId, undefined, ctx.data.people.technician.id);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const atDesk = await ctx.http.post(`/bons/${bonId}/initiate-inperson`, 'technician', { type: 'pv_cloture' });
      expect(await emission).toBe(true);
      expect(atDesk.status, JSON.stringify(atDesk.body)).toBe(201);
    } finally {
      spy.mockRestore();
    }

    const links = await validLinks(bonId);
    expect(links).toHaveLength(1);
    expect(links[0].isInPerson).toBe(true);
  });
});

/**
 * Insère une invalidation du lien, validée sur une AUTRE connexion, juste
 * avant l'écriture de la signature : au moment où la transaction de signature
 * compte les équipements non rendus, après avoir relu un lien encore valide.
 */
function invalidateLinkDuringNextSignature(prisma: PrismaService, bonId: string) {
  const original = prisma.$transaction.bind(prisma) as (fn: unknown, options?: unknown) => Promise<unknown>;
  let injected = false;
  const inject = (tx: Prisma.TransactionClient): Prisma.TransactionClient =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop !== 'bonEquipment') return Reflect.get(target, prop, receiver);
        return {
          ...target.bonEquipment,
          count: async (args: Prisma.BonEquipmentCountArgs) => {
            if (!injected) {
              injected = true;
              await invalidatePendingLinks(prisma, bonId, 'modified');
            }
            return target.bonEquipment.count(args);
          },
        };
      },
    });
  return vi.spyOn(prisma, '$transaction').mockImplementation(((arg: unknown, options?: unknown) =>
    typeof arg === 'function'
      ? original((tx: Prisma.TransactionClient) => (arg as (t: Prisma.TransactionClient) => unknown)(inject(tx)), options)
      : original(arg, options)) as never);
}

describe('Signature d’un lien invalidé pendant son écriture', () => {
  it('400 « Ce lien n’est plus valide », rien n’est signé et le bon n’avance pas', async () => {
    const bonId = await restitutionReadyToSend();
    expect((await ctx.http.post(`/bons/${bonId}/resend`, 'technician', {})).status).toBe(201);
    const link = await latestLink(ctx, bonId);
    const before = await ctx.prisma.bon.findUniqueOrThrow({ where: { id: bonId }, select: { status: true } });

    const spy = invalidateLinkDuringNextSignature(ctx.prisma, bonId);
    let res: Awaited<ReturnType<typeof signLink>>;
    try {
      res = await signLink(ctx, link.token, 'collaborator');
    } finally {
      spy.mockRestore();
    }

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.message).toMatch(/^Ce lien n'est plus valide/);
    const after = await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } });
    expect(after).toMatchObject({ signed: false, signedAt: null, invalidatedReason: 'modified' });
    const bon = await ctx.prisma.bon.findUniqueOrThrow({ where: { id: bonId }, select: { status: true } });
    expect(bon.status).toBe(before.status);
    expect(await ctx.prisma.auditLog.count({ where: { bonId, action: 'signed_restitution' } })).toBe(0);
  });
});
