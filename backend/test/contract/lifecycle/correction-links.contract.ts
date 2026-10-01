/**
 * Un document corrigé dit la vérité à chaque étape, sur une vraie base
 * (constats R5 n° 1 et n° 5) :
 *  - contestation Fondée d'une restitution : l'ancien lien dit « en cours de
 *    correction » tant que rien n'est reparti, puis, une fois la restitution
 *    corrigée et renvoyée, qu'un nouveau lien a été envoyé ; l'email de ce
 *    nouveau lien annonce la correction ;
 *  - marquage annulé sans contestation, plus rien de rendu : l'ancien lien ne
 *    promet aucun nouveau lien.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../../../src/notification/notification.service';
import { ContractContext, startContractContext } from '../support/context';
import { expectShape } from '../support/shape';
import { signatureReplaced } from '../shapes/workflow';
import { createActiveBon, latestLink, signIt } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Restitution des `count` équipements par email : marquage, signature IT, lien. */
async function restitutionSentByEmail(count: number) {
  const bon = await createActiveBon(ctx, ctx.data.people.collaborator, count);
  const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
    returnedEquipmentIds: bon.equipmentIds,
  });
  expect(marked.status, JSON.stringify(marked.body)).toBe(201);
  await signIt(ctx, bon.id, 'restitution');
  const sent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
  expect(sent.status, JSON.stringify(sent.body)).toBe(201);
  return { ...bon, link: await latestLink(ctx, bon.id) };
}

/** Ce que la page de signature reçoit pour l'ancien lien. */
async function oldLinkAsCollaborator(token: string) {
  const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
  expect(res.status).toBe(200);
  expectShape(res.body, signatureReplaced);
  return res.body;
}

describe('Contestation Fondée d’une restitution, correction, nouveau lien', () => {
  it('chaque étape de l’ancien lien, puis l’email « Restitution corrigée »', async () => {
    const bon = await restitutionSentByEmail(2);
    const contested = await ctx.http.post(`/bons/${bon.id}/contestation`, 'collaborator', {
      message: 'Je n’ai rendu que le portable.',
      document: 'restitution',
    });
    expect(contested.status, JSON.stringify(contested.body)).toBe(201);
    const resolved = await ctx.http.post(`/contestations/${contested.body.id}/resolve`, 'admin', {
      outcome: 'founded',
      resolutionMessage: 'Nous corrigeons la restitution.',
    });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201);

    // Pendant la correction : rien n'est reparti.
    expect(await oldLinkAsCollaborator(bon.link.token)).toMatchObject({
      status: 'replaced', invalidatedReason: 'contested', documentType: 'restitution', followUp: 'link_coming',
    });

    // Correction du marquage : l'écran n'est pas encore rendu, le portable si.
    const undone = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: [bon.equipmentIds[1]] });
    expect(undone.status, JSON.stringify(undone.body)).toBe(201);
    expect((await oldLinkAsCollaborator(bon.link.token)).followUp).toBe('link_coming');

    // Signature IT puis renvoi : l'email annonce la correction.
    await signIt(ctx, bon.id, 'restitution');
    const notifications = ctx.app.get(NotificationService);
    const sendRestitution = vi.spyOn(notifications, 'sendRestitutionRequest').mockResolvedValue();
    const resent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    expect(resent.status, JSON.stringify(resent.body)).toBe(201);
    expect(sendRestitution).toHaveBeenCalledTimes(1);
    expect(sendRestitution.mock.calls[0][2]).toEqual({ correction: 'contested' });

    // L'ancien lien le dit désormais.
    expect(await oldLinkAsCollaborator(bon.link.token)).toMatchObject({
      invalidatedReason: 'contested', followUp: 'link_sent',
    });
  });

  it('un simple renvoi, sans correction, reste une demande ordinaire', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    await signIt(ctx, bon.id, 'restitution');
    const sendRestitution = vi.spyOn(ctx.app.get(NotificationService), 'sendRestitutionRequest').mockResolvedValue();

    const sent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});

    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sendRestitution.mock.calls[0][2]).toEqual({ correction: null });
  });
});

describe('Marquage annulé sans contestation, plus rien de rendu (0078)', () => {
  it('l’ancien lien ne promet aucun nouveau lien', async () => {
    const bon = await restitutionSentByEmail(1);

    const undone = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: bon.equipmentIds });

    expect(undone.status, JSON.stringify(undone.body)).toBe(201);
    expect(await oldLinkAsCollaborator(bon.link.token)).toMatchObject({
      invalidatedReason: 'return_corrected', documentType: 'restitution', followUp: 'none',
    });
  });
});
