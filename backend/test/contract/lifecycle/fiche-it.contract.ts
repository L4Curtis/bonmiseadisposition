/**
 * Fiche IT d'un bon, sur une vraie base : rappels que ni les équipements ni
 * les signatures ne disent — contestation à traiter, correction à faire après
 * une contestation Fondée sur une restitution, demande de nouveau lien du
 * collaborateur — et restitution au guichet qui décoche un équipement déjà
 * marqué rendu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BonDetail } from '../../../src/contracts/bons';
import { BonsService } from '../../../src/bons/bons.service';
import { ContractContext, startContractContext } from '../support/context';
import { expectShape } from '../support/shape';
import { bonDetail } from '../shapes/bons';
import { createActiveBon, itDetail, latestLink, signIt } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Restitution de tous les équipements par email : marquage, signature IT, lien. */
async function restitutionSentByEmail(count: number) {
  const bon = await createActiveBon(ctx, ctx.data.people.collaborator, count);
  const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
    returnedEquipmentIds: bon.equipmentIds,
  });
  expect(marked.status, JSON.stringify(marked.body)).toBe(201);
  await signIt(ctx, bon.id, 'restitution');
  const sent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
  expect(sent.status, JSON.stringify(sent.body)).toBe(201);
  return bon;
}

describe('Contestation d’une restitution, puis Fondée : la fiche guide la correction', () => {
  let bonId = '';
  let equipmentIds: string[] = [];
  let contestationId = '';

  it('bon « Contesté » : le motif est rappelé, sans action du cycle de vie', async () => {
    const bon = await restitutionSentByEmail(2);
    bonId = bon.id;
    equipmentIds = bon.equipmentIds;
    const res = await ctx.http.post(`/bons/${bonId}/contestation`, 'collaborator', {
      message: 'Je n’ai pas rendu la souris.',
      document: 'restitution',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    contestationId = res.body.id;

    const detail = await itDetail(ctx, bonId);
    expectShape(detail, bonDetail);
    expect(detail.status).toBe('contested');
    expect(detail.contestation).toMatchObject({
      id: contestationId, stage: 'open', message: 'Je n’ai pas rendu la souris.', contestedDocument: 'restitution',
    });
  });

  it('prise en charge : toujours à trancher, avec le nom de qui l’a prise', async () => {
    const reviewed = await ctx.http.patch(`/contestations/${contestationId}/review`, 'technician', {});
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
    const detail = await itDetail(ctx, bonId);
    expect(detail.contestation).toMatchObject({
      stage: 'open', reviewedBy: { displayName: ctx.data.people.technician.displayName },
    });
  });

  it('le titulaire ne reçoit jamais ce rappel', async () => {
    const res = await ctx.http.get(`/bons/${bonId}`, 'collaborator');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('contestation');
    expect(res.body).not.toHaveProperty('linkRequest');
  });

  it('Fondée : « corriger le marquage » devient l’action principale, avec le motif rappelé', async () => {
    const resolved = await ctx.http.patch(`/contestations/${contestationId}/resolve`, 'admin', {
      outcome: 'founded',
      resolutionMessage: 'Nous corrigeons la restitution.',
    });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);

    const detail = await itDetail(ctx, bonId);
    expectShape(detail, bonDetail);
    expect(detail.contestation).toMatchObject({ stage: 'correction', message: 'Je n’ai pas rendu la souris.' });
    expect(detail.availableActions?.[0]).toEqual({ action: 'undo_return', primary: true, blockedReason: null });
  });

  it('une fois le marquage corrigé, le rappel disparaît et la signature reprend la main', async () => {
    const undone = await ctx.http.post(`/bons/${bonId}/undo-return`, 'technician', { equipmentIds: [equipmentIds[1]] });
    expect(undone.status, JSON.stringify(undone.body)).toBe(201);
    expect(undone.body.contestation).toBeNull();
    expect(undone.body.availableActions[0]).toMatchObject({ action: 'resend', primary: true });
  });

  it('la signature IT retirée par la contestation garde son motif « contesté » ; la correction ne le réécrit pas', async () => {
    const itSig = await ctx.prisma.signature.findMany({ where: { bonId, type: 'it_cachet', pdfType: 'restitution' } });
    expect(itSig.map((s) => s.invalidatedReason)).toEqual(['contested']);
  });
});

describe('Demande de nouveau lien du collaborateur (S26)', () => {
  it('visible sur la fiche IT jusqu’au renvoi', async () => {
    const bon = await restitutionSentByEmail(1);
    const link = await latestLink(ctx, bon.id);
    await ctx.prisma.signature.update({ where: { id: link.id }, data: { tokenExpiresAt: new Date(Date.now() - 60_000) } });
    const asked = await ctx.http.post(`/signature/${link.token}/request-new-link`, 'collaborator', {});
    expect(asked.status, JSON.stringify(asked.body)).toBeLessThan(300);

    const detail = await itDetail(ctx, bon.id);
    expectShape(detail, bonDetail);
    expect(detail.linkRequest).toMatchObject({ documentType: 'restitution' });

    const resent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    expect(resent.status, JSON.stringify(resent.body)).toBe(201);
    expect((await itDetail(ctx, bon.id)).linkRequest).toBeNull();
  });
});

describe('Restitution au guichet : décocher un équipement déjà marqué rendu (IMD n° 9)', () => {
  it('l’équipement décoché revient chez le collaborateur, le nouveau est marqué, en un seul geste', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 3);
    const [first, second, third] = bon.equipmentIds;
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [first, second] });

    const res = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [third],
      undoEquipmentIds: [second],
      inPerson: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectShape(res.body, bonDetail);
    const states = Object.fromEntries((res.body as BonDetail).equipments.map((e) => [e.id, e.returnState]));
    expect(states).toEqual({ [first]: 'returned_to_sign', [second]: 'out', [third]: 'returned_to_sign' });
    const audit = await ctx.prisma.auditLog.findFirst({ where: { bonId: bon.id, action: 'return_marking_undone' } });
    expect(audit?.details).toMatchObject({ equipmentIds: [second] });
  });

  it('décocher au guichet retire la signature IT avec le motif « restitution corrigée »', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 3);
    const [first, second, third] = bon.equipmentIds;
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [first, second] });
    await signIt(ctx, bon.id, 'restitution');

    const res = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [third],
      undoEquipmentIds: [second],
      inPerson: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const itSig = await ctx.prisma.signature.findFirstOrThrow({ where: { bonId: bon.id, type: 'it_cachet', pdfType: 'restitution' } });
    expect(itSig.invalidatedReason).toBe('return_corrected');
  });

  it('un équipement qui n’attend pas de signature ne peut pas être décoché : 400, rien n’est écrit', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
    const [first, second] = bon.equipmentIds;
    const res = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [first],
      undoEquipmentIds: [second],
      inPerson: true,
    });
    expect(res.status).toBe(400);
    const equipments = await ctx.prisma.bonEquipment.findMany({ where: { bonId: bon.id } });
    expect(equipments.every((e) => e.returnedAt === null)).toBe(true);
  });
});

describe('Nouveau marquage pendant qu’une restitution attend sa signature (IMD n° 11)', () => {
  /** Restitution d'un équipement sur deux envoyée par email : le lien attend. */
  async function firstRestitutionSent() {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [bon.equipmentIds[0]] });
    await signIt(ctx, bon.id, 'restitution');
    expect((await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {})).status).toBe(201);
    return { bon, link: await latestLink(ctx, bon.id) };
  }

  it('au guichet, l’ancien lien ne vaut plus avec le motif « au guichet », pas « remplacé par un nouveau lien »', async () => {
    const { bon, link } = await firstRestitutionSent();
    const res = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [bon.equipmentIds[1]],
      inPerson: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedReason).toBe('in_person');
  });

  it('par email, l’ancien lien ne vaut plus avec le motif « restitution corrigée » (aucun nouveau lien n’est encore parti)', async () => {
    const { bon, link } = await firstRestitutionSent();
    const res = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [bon.equipmentIds[1]],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedReason).toBe('return_corrected');
  });
});

describe('Brouillon remplaçant : les numéros du bon remplacé ne sont pas des conflits (IB n° 4)', () => {
  it('GET /equipment/serial-conflicts exclut le bon remplacé quand le remplaçant est exclu', async () => {
    const original = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const replacement = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(BonsService).createReplacementBon(tx, original.id, '00000000-0000-4000-8000-000000000000', ctx.data.people.technician.id),
    );
    const serial = (await ctx.prisma.bonEquipment.findFirstOrThrow({ where: { bonId: original.id } })).serialNumber!;

    const asReplacement = await ctx.http.get(
      `/equipment/serial-conflicts?serials=${encodeURIComponent(serial)}&excludeBonId=${replacement.id}`,
      'technician',
    );
    expect(asReplacement.status).toBe(200);
    expect(asReplacement.body.items).toEqual([]);

    // Sans rapport avec le remplacement, l'original reste bien un conflit.
    const other = await ctx.http.get(`/equipment/serial-conflicts?serials=${encodeURIComponent(serial)}`, 'technician');
    expect((other.body.items as { bonId: string }[]).map((i) => i.bonId)).toContain(original.id);
  });
});

describe('Signataires IT affichés par leur nom (IB n° 13)', () => {
  it('chaque signature de la fiche IT porte le nom du compte signataire', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const detail = await itDetail(ctx, bon.id);
    expectShape(detail, bonDetail);
    const itSig = (detail as BonDetail).signatures.find((s) => s.type === 'it_cachet');
    expect(itSig?.signerName).toBe(ctx.data.people.technician.displayName);
  });
});
