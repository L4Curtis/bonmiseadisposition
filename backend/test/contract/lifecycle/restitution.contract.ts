/**
 * Cycle de vie, sur une vraie base : restitution partielle au guichet (R-001),
 * ordre marquage → signature IT → lien (R-010, R-022), annulation d'un
 * marquage (R-011), renvoi fondé sur l'état métier (R-005), PV signé sur
 * place (R-006), règle d'envoi pour un compte désactivé (R-004).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BonsService } from '../../../src/bons/bons.service';
import { ContractContext, startContractContext } from '../support/context';
import { expectShape } from '../support/shape';
import { bonDetail } from '../shapes/bons';
import { actionNames, createActiveBon, itDetail, latestLink, signIt, signLink, SIGNATURE_PNG } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Restitution partielle au guichet (R-001)', () => {
  it('seuls les équipements cochés sont rendus ; le reste reste chez le collaborateur après la signature', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 3);
    const [first, second, third] = bon.equipmentIds;

    const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [first, second],
      inPerson: true,
    });
    expect(marked.status).toBe(201);
    expectShape(marked.body, bonDetail);
    expect(marked.body).toMatchObject({
      status: 'partially_returned',
      subStatus: 'partial_restitution_to_sign',
      pendingSignature: { type: 'restitution', expired: true, itSigned: false, sentAt: null },
    });
    expect(marked.body.equipments.map((e: { returnState?: string }) => e.returnState)).toEqual([
      'returned_to_sign', 'returned_to_sign', 'out',
    ]);
    // Aucun lien avant la signature IT (R-010, R-022).
    expect(await ctx.prisma.signature.count({ where: { bonId: bon.id, type: 'restitution' } })).toBe(0);
    const refused = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    expect(refused.status).toBe(400);

    await signIt(ctx, bon.id, 'restitution');
    const inPerson = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    expect(inPerson.status).toBe(201);
    expect(inPerson.body.bon.pendingSignature).toMatchObject({ type: 'restitution', expired: false, inPerson: true, itSigned: true });

    const signed = await signLink(ctx, inPerson.body.token, 'technician');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);

    const after = await itDetail(ctx, bon.id);
    expect(after).toMatchObject({ status: 'partially_returned', subStatus: 'equipment_still_out', pendingSignature: null });
    const third3 = after.equipments.find((e: { id: string }) => e.id === third);
    expect(third3.returnState).toBe('out');
    expect(after.awaitingSince).toBeNull();
  });

  it('au guichet, une restitution attendue par email invalide le lien email (motif « au guichet »)', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [bon.equipmentIds[0]] });
    await signIt(ctx, bon.id, 'restitution');
    const resent = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    expect(resent.status).toBe(201);
    const emailLink = await latestLink(ctx, bon.id);

    const inPerson = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    expect(inPerson.status).toBe(201);
    const invalidated = await ctx.prisma.signature.findUniqueOrThrow({ where: { id: emailLink.id } });
    expect(invalidated.invalidatedReason).toBe('in_person');
  });
});

describe('Annuler le marquage « rendu » avant la signature (R-011)', () => {
  it('l’équipement revient chez le collaborateur, le lien et la signature IT de restitution ne valent plus', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    await signIt(ctx, bon.id, 'restitution');
    await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    const link = await latestLink(ctx, bon.id);

    const res = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: [bon.equipmentIds[1]] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'partially_returned',
      subStatus: 'partial_restitution_to_sign',
      pendingSignature: { type: 'restitution', expired: true, itSigned: false },
    });
    expect(res.body.equipments[1].returnState).toBe('out');
    // Motif juste pour le collaborateur : la restitution a été corrigée, pas le bon.
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedReason).toBe('return_corrected');
    const audit = await ctx.prisma.auditLog.findFirst({ where: { bonId: bon.id, action: 'return_marking_undone' } });
    expect(audit).not.toBeNull();
  });

  it('seule la signature IT de la restitution en cours est retirée : celle d’une restitution déjà signée reste valable', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 3);
    const [first, second] = bon.equipmentIds;
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [first], inPerson: true });
    await signIt(ctx, bon.id, 'restitution');
    const inPerson = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    expect((await signLink(ctx, inPerson.body.token, 'technician')).status).toBe(200);
    const signedRestitutionIt = await ctx.prisma.signature.findFirstOrThrow({
      where: { bonId: bon.id, type: 'it_cachet', pdfType: 'restitution' },
    });

    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [second], inPerson: true });
    await signIt(ctx, bon.id, 'restitution');
    const undone = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: [second] });
    expect(undone.status).toBe(201);

    const itRestitutions = await ctx.prisma.signature.findMany({
      where: { bonId: bon.id, type: 'it_cachet', pdfType: 'restitution' },
      orderBy: { signedAt: 'asc' },
    });
    expect(itRestitutions).toHaveLength(2);
    expect(itRestitutions[0].id).toBe(signedRestitutionIt.id);
    expect(itRestitutions[0].invalidatedAt).toBeNull();
    expect(itRestitutions[1].invalidatedReason).toBe('return_corrected');
  });

  it('tout annuler ramène le bon « En cours » ; un équipement signé ne peut pas être remis dehors', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    const res = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: bon.equipmentIds });
    expect(res.body).toMatchObject({ status: 'active', pendingSignature: null, awaitingSince: null });

    const signedPart = ctx.data.bons.archived;
    const refused = await ctx.http.post(`/bons/${signedPart.id}/undo-return`, 'technician', { equipmentIds: signedPart.equipmentIds });
    expect(refused.status).toBe(400);
  });
});

describe('Renvoi fondé sur l’état métier (R-005, R-016)', () => {
  it('restitution partielle dont la ligne de signature a été purgée : renvoyer crée un nouveau lien', async () => {
    const { partiallyReturned } = ctx.data.bons;
    const before = await itDetail(ctx, partiallyReturned.id);
    expect(before.pendingSignature).toMatchObject({ type: 'restitution', expired: true });
    expect(actionNames(before)).toContain('resend');

    // La signature IT du jeu de données précède le marquage : elle ne vaut pas pour ce document.
    const refused = await ctx.http.post(`/bons/${partiallyReturned.id}/resend`, 'technician', {});
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/signature IT/);

    await signIt(ctx, partiallyReturned.id, 'restitution');
    const res = await ctx.http.post(`/bons/${partiallyReturned.id}/resend`, 'technician', {});
    expect(res.status).toBe(201);
    const link = await latestLink(ctx, partiallyReturned.id);
    expect(link.type).toBe('restitution');
    const after = await itDetail(ctx, partiallyReturned.id);
    expect(after.pendingSignature).toMatchObject({ expired: false, itSigned: true });
  });

  it('lien expiré : aucune demande de confirmation « envoyé récemment »', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    await signIt(ctx, bon.id, 'restitution');
    await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    const link = await latestLink(ctx, bon.id);
    await ctx.prisma.signature.update({ where: { id: link.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });

    const detail = await itDetail(ctx, bon.id);
    expect(detail.pendingSignature).toMatchObject({ expired: true });
    expect(detail.availableActions[0]).toEqual({ action: 'resend', primary: true, blockedReason: null });
    const res = await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    expect(res.status).toBe(201);
  });
});

describe('Compte désactivé : aucun lien par email (R-004)', () => {
  it('la restitution par email est refusée avant tout marquage ; le guichet reste possible', async () => {
    const { departedActive } = ctx.data.bons;
    const detail = await itDetail(ctx, departedActive.id);
    expect(detail.linkRefusal).toMatchObject({ reason: 'inactive_account' });
    expect(detail.collaborateurActive).toBe(false);
    const byEmail = detail.availableActions.find((a: { action: string }) => a.action === 'start_restitution');
    expect(byEmail.blockedReason).toMatch(/désactivé/);

    const refused = await ctx.http.post(`/bons/${departedActive.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: departedActive.equipmentIds,
    });
    expect(refused.status).toBe(400);
    expect(await ctx.prisma.bonEquipment.count({ where: { bonId: departedActive.id, returnedAt: { not: null } } })).toBe(0);

    const atDesk = await ctx.http.post(`/bons/${departedActive.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: departedActive.equipmentIds,
      inPerson: true,
    });
    expect(atDesk.status).toBe(201);
    expect(atDesk.body.status).toBe('sent_restitution');
  });
});

describe('PV de non-restitution signé sur place (R-006)', () => {
  it('collaborateur sans adresse : déclaration, restitution au guichet, puis PV au guichet jusqu’à la clôture', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.manual, 2);
    const [kept, lost] = bon.equipmentIds;
    const declared = await ctx.http.post(`/bons/${bon.id}/declare-not-returned`, 'technician', {
      equipmentIds: [lost],
      reason: 'Perdu sur le chantier',
      signatureDataUrl: SIGNATURE_PNG,
    });
    expect(declared.status).toBe(201);
    expect(declared.body.subStatus).toBe('loss_declared');
    // Certificat du PV : la signature IT porte le poste du technicien.
    const itSignature = await ctx.prisma.signature.findFirstOrThrow({
      where: { bonId: bon.id, type: 'it_cachet' },
      orderBy: { createdAt: 'desc' },
    });
    expect(itSignature.signerIp).not.toBeNull();
    expect(itSignature.signerUserAgent).not.toBeNull();

    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: [kept], inPerson: true });
    await signIt(ctx, bon.id, 'restitution');
    const restitution = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    const signed = await signLink(ctx, restitution.body.token, 'technician');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);

    const pvDue = await itDetail(ctx, bon.id);
    expect(pvDue).toMatchObject({ subStatus: 'pv_to_sign', pendingSignature: { type: 'pv_cloture' } });
    expect(actionNames(pvDue)).toContain('show_in_person_link');

    const pv = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'pv_cloture' });
    expect(pv.status).toBe(201);
    const pvSigned = await signLink(ctx, pv.body.token, 'technician');
    expect(pvSigned.status, JSON.stringify(pvSigned.body)).toBe(200);
    expect((await itDetail(ctx, bon.id)).status).toBe('archived');
  });
});

describe('Filtre de liste par sous-état (liste = calcul de la fiche)', () => {
  it.each(['partial_restitution_to_sign', 'pv_to_sign', 'loss_declared', 'equipment_still_out'] as const)(
    'GET /bons?subStatus=%s renvoie exactement les bons dont la fiche porte ce sous-état',
    async (wanted) => {
      const list = await ctx.http.get(`/bons?subStatus=${wanted}&limit=100`, 'technician');
      expect(list.status).toBe(200);
      const partial = await ctx.prisma.bon.findMany({ where: { status: 'partially_returned' }, select: { id: true } });
      const expected: string[] = [];
      for (const { id } of partial) {
        if ((await itDetail(ctx, id)).subStatus === wanted) expected.push(id);
      }
      const listed = list.body.bons.map((b: { id: string }) => b.id).sort();
      expect(listed).toEqual(expected.sort());
      expect(list.body.total).toBe(expected.length);
      for (const bon of list.body.bons) expect(bon.subStatus).toBe(wanted);
    },
  );

  it('valeur inconnue : 400', async () => {
    expect((await ctx.http.get('/bons?subStatus=inconnu', 'technician')).status).toBe(400);
  });
});

describe('Contestation Fondée sur une restitution ou un PV : correction du bon d’origine', () => {
  it('restitution : lien invalidé (« contesté »), signature IT à refaire, puis correction et nouveau lien', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 2);
    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    await signIt(ctx, bon.id, 'restitution');
    await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {});
    const link = await latestLink(ctx, bon.id);

    await ctx.app.get(BonsService).reopenForCorrection(bon.id, 'restitution', ctx.data.people.technician.id);

    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedReason).toBe('contested');
    const reopened = await itDetail(ctx, bon.id);
    expect(reopened.pendingSignature).toMatchObject({ type: 'restitution', expired: true, itSigned: false });
    expect(actionNames(reopened)).toEqual(expect.arrayContaining(['resend', 'undo_return']));
    expect(await ctx.prisma.auditLog.count({ where: { bonId: bon.id, action: 'bon_reopened_for_correction' } })).toBe(1);

    // Correction : l'équipement coché à tort revient chez le collaborateur, puis nouveau lien.
    const undone = await ctx.http.post(`/bons/${bon.id}/undo-return`, 'technician', { equipmentIds: [bon.equipmentIds[1]] });
    expect(undone.body.status).toBe('partially_returned');
    await signIt(ctx, bon.id, 'restitution');
    expect((await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {})).status).toBe(201);
  });

  it('refusé quand le document n’attend pas de signature', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    await expect(
      ctx.app.get(BonsService).reopenForCorrection(bon.id, 'pv_cloture', ctx.data.people.technician.id),
    ).rejects.toThrow(/PV de non-restitution/);
  });
});
