/**
 * Cycle de vie, sur une vraie base : remise (contrôles avant signature IT,
 * R-003 ; signature IT exigée, R-022), civilité retenue (R-002), modification
 * d'un bon envoyé (R-012), annulation motivée (R-013), les deux gestes sans
 * signature (R-014), fiche vue par le titulaire (champs réservés à l'IT) et
 * bon remplaçant d'une contestation Fondée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BonsService } from '../../../src/bons/bons.service';
import { ContractContext, startContractContext } from '../support/context';
import { expectShape } from '../support/shape';
import { bonDetail, missingSerialsError, myBons, sendChecks } from '../shapes/bons';
import { actionNames, createActiveBon, itDetail, latestLink, signIt, signLink } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

async function createDraft(equipments: object[], civilite: 'mme' | 'mr' = 'mme', internalNote?: string) {
  const res = await ctx.http.post('/bons', 'technician', {
    filialeId: ctx.data.filialeId,
    collaborateurId: ctx.data.people.otherCollaborator.id,
    civilite,
    dateMiseDisposition: '2026-09-20',
    notes: 'Remarque visible du collaborateur',
    internalNote,
    equipments,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe('Remise : contrôles, signature IT, lien', () => {
  it('ligne sans numéro : signalée avant la signature IT, refusée sans confirmation, tracée avec', async () => {
    const draft = await createDraft([
      { catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-REMISE-OK' },
      { catalogItemId: ctx.data.catalog.screenId },
    ]);
    const checks = await ctx.http.get(`/bons/${draft.id}/send-check`, 'technician');
    expect(checks.status).toBe(200);
    expectShape(checks.body, sendChecks);
    expect(checks.body.missingSerials).toEqual([expect.objectContaining({ position: 2 })]);

    const withoutIt = await ctx.http.post(`/bons/${draft.id}/send`, 'technician', { confirmMissingSerials: true });
    expect(withoutIt.status).toBe(400);
    expect(withoutIt.body.message).toMatch(/signature IT/);

    await signIt(ctx, draft.id, 'mise_disposition');
    const unconfirmed = await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    expect(unconfirmed.status).toBe(409);
    expectShape(unconfirmed.body, missingSerialsError);

    const sent = await ctx.http.post(`/bons/${draft.id}/send`, 'technician', { confirmMissingSerials: true });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ status: 'sent_mise_dispo', pendingSignature: { type: 'mise_disposition', expired: false } });
    expect(sent.body.awaitingSince).not.toBeNull();
    expect(await ctx.prisma.auditLog.count({ where: { bonId: draft.id, action: 'bon_sent_without_serial' } })).toBe(1);
  });

  it('la remise au guichet applique les mêmes contrôles de numéros', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.screenId }]);
    await signIt(ctx, draft.id, 'mise_disposition');
    const res = await ctx.http.post(`/bons/${draft.id}/initiate-inperson`, 'technician', { type: 'mise_disposition' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('missing_serials');
  });

  it('la civilité choisie est retenue sur le compte du collaborateur (R-002)', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-CIVILITE' }], 'mr');
    expect(draft.collaborateur.civilite).toBe('mr');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.data.people.otherCollaborator.id } });
    expect(user.civilite).toBe('mr');
    const refused = await ctx.http.post('/bons', 'technician', {
      filialeId: ctx.data.filialeId,
      collaborateurId: ctx.data.people.otherCollaborator.id,
      dateMiseDisposition: '2026-09-20',
      equipments: [],
    });
    expect(refused.status).toBe(400);
  });
});

describe('Modifier un bon envoyé non signé (R-012)', () => {
  it('le lien est invalidé (« bon modifié »), une nouvelle signature IT est exigée, puis un nouveau lien part', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-MODIF-1' }]);
    await signIt(ctx, draft.id, 'mise_disposition');
    await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    const firstLink = await latestLink(ctx, draft.id);

    const edited = await ctx.http.put(`/bons/${draft.id}`, 'technician', {
      equipments: [{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-MODIF-CORRIGE' }],
    });
    expect(edited.status).toBe(200);
    expectShape(edited.body, bonDetail);
    expect(edited.body).toMatchObject({
      status: 'sent_mise_dispo',
      pendingSignature: { expired: true, itSigned: false, expiresAt: null },
    });
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: firstLink.id } })).invalidatedReason).toBe('modified');
    expect(await ctx.prisma.auditLog.count({ where: { bonId: draft.id, action: 'bon_modified_after_send' } })).toBe(1);

    expect((await ctx.http.post(`/bons/${draft.id}/resend`, 'technician', {})).status).toBe(400);
    await signIt(ctx, draft.id, 'mise_disposition');
    expect((await ctx.http.post(`/bons/${draft.id}/resend`, 'technician', {})).status).toBe(201);
    const newLink = await latestLink(ctx, draft.id);
    expect(newLink.id).not.toBe(firstLink.id);
  });
});

describe('Modifier seulement la note interne IT d’un bon envoyé', () => {
  it('le document du collaborateur ne change pas : le lien et la signature IT restent valables', async () => {
    const equipments = [{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-NOTE-SEULE' }];
    const draft = await createDraft(equipments);
    await signIt(ctx, draft.id, 'mise_disposition');
    await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    const link = await latestLink(ctx, draft.id);

    // Le formulaire renvoie tout le bon : seule la note interne diffère.
    const edited = await ctx.http.put(`/bons/${draft.id}`, 'technician', {
      filialeId: ctx.data.filialeId,
      collaborateurId: ctx.data.people.otherCollaborator.id,
      civilite: 'mme',
      dateMiseDisposition: '2026-09-20',
      notes: 'Remarque visible du collaborateur',
      internalNote: 'Rappeler le collaborateur lundi',
      equipments,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      status: 'sent_mise_dispo',
      internalNote: 'Rappeler le collaborateur lundi',
      pendingSignature: { expired: false, itSigned: true },
    });
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedAt).toBeNull();
    expect(await ctx.prisma.auditLog.count({ where: { bonId: draft.id, action: 'bon_modified_after_send' } })).toBe(0);
  });
});

describe('Annulation motivée (R-013) et gestes sans signature (R-014)', () => {
  it('annuler un bon envoyé exige un motif, invalide le lien et le garde sur la fiche', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-ANNUL-1' }]);
    await signIt(ctx, draft.id, 'mise_disposition');
    await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    const link = await latestLink(ctx, draft.id);

    expect((await ctx.http.post(`/bons/${draft.id}/cancel`, 'technician', {})).status).toBe(400);
    const res = await ctx.http.post(`/bons/${draft.id}/cancel`, 'technician', { reason: 'Collaborateur finalement non recruté' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'cancelled', cancellationReason: 'Collaborateur finalement non recruté', awaitingSince: null });
    expect((await ctx.prisma.signature.findUniqueOrThrow({ where: { id: link.id } })).invalidatedReason).toBe('cancelled');
  });

  it('« Constater la remise sans signature » : En cours, motif, document dédié', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-REMISE-SANS-SIG' }]);
    await signIt(ctx, draft.id, 'mise_disposition');
    await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    const res = await ctx.http.post(`/bons/${draft.id}/handover-without-signature`, 'technician', {
      reason: 'Matériel remis en main propre, collaborateur injoignable',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'active', handoverWithoutSignatureReason: expect.stringContaining('main propre') });
    const snapshot = await ctx.prisma.pdfSnapshot.findFirst({ where: { bonId: draft.id, type: 'remise_sans_signature' } });
    expect(snapshot).not.toBeNull();
  });

  it('« Clôturer sans signature » : refusé tant que du matériel est dehors, puis Clôturé avec son motif', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const refused = await ctx.http.post(`/bons/${bon.id}/close-without-signature`, 'technician', { reason: 'Départ sans restitution signée' });
    expect(refused.status).toBe(400);

    await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', { returnedEquipmentIds: bon.equipmentIds });
    const res = await ctx.http.post(`/bons/${bon.id}/close-without-signature`, 'technician', { reason: 'Départ sans restitution signée' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'archived', closedWithoutSignatureReason: 'Départ sans restitution signée' });
    expect(await ctx.prisma.pdfSnapshot.count({ where: { bonId: bon.id, type: 'cloture_sans_signature' } })).toBe(1);
  });
});

describe('Fiche vue par le collaborateur titulaire', () => {
  it('ni note interne, ni refus d’envoi, ni actions ; l’état calculé reste visible', async () => {
    const res = await ctx.http.get(`/bons/${ctx.data.bons.active.id}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, bonDetail);
    expect(res.body).not.toHaveProperty('internalNote');
    expect(res.body).not.toHaveProperty('linkRefusal');
    expect(res.body).not.toHaveProperty('availableActions');
    expect(res.body.lateness?.signatureDays).toBeNull();
    expect(res.body.lateness?.returnDays).toBeGreaterThanOrEqual(2);

    const it = await itDetail(ctx, ctx.data.bons.active.id);
    expect(it).toHaveProperty('internalNote');
    expect(actionNames(it)).toEqual(['start_restitution', 'restitution_in_person', 'declare_not_returned']);
  });
});

describe('Portail « Mes équipements »', () => {
  it('garde le jeton du dernier lien expiré, pour « Demander un nouveau lien »', async () => {
    const draft = await createDraft([{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: 'SN-PORTAIL-EXPIRE' }]);
    await signIt(ctx, draft.id, 'mise_disposition');
    await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {});
    const link = await latestLink(ctx, draft.id);
    await ctx.prisma.signature.update({ where: { id: link.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });

    const res = await ctx.http.get('/bons/mes-bons', 'otherCollaborator');
    expect(res.status).toBe(200);
    const mine = res.body.find((b: { id: string }) => b.id === draft.id);
    expect(mine.pendingSignature).toMatchObject({ type: 'mise_disposition', expired: true });
    const expired = mine.signatures.find((s: { id: string }) => s.id === link.id);
    expect(expired.token).toBe(link.token);
  });
});

describe('Bon remplaçant (contestation Fondée)', () => {
  it('remise du remplaçant constatée sans signature : l’original est aussi clôturé « remplacé »', async () => {
    const original = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const replacement = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(BonsService).createReplacementBon(tx, original.id, '00000000-0000-4000-8000-000000000000', ctx.data.people.technician.id),
    );
    await ctx.prisma.bonEquipment.updateMany({ where: { bonId: replacement.id }, data: { serialNumber: 'SN-REMPLACANT-SANS-SIG' } });
    await signIt(ctx, replacement.id, 'mise_disposition');
    await ctx.http.post(`/bons/${replacement.id}/send`, 'technician', { confirmSerialConflicts: true });
    const res = await ctx.http.post(`/bons/${replacement.id}/handover-without-signature`, 'technician', {
      reason: 'Remise en main propre, collaboratrice injoignable',
    });
    expect(res.status).toBe(201);
    const closed = await itDetail(ctx, original.id);
    expect(closed).toMatchObject({ status: 'archived', replacedBy: { id: replacement.id } });
    // Suivi sur le remplaçant : jamais « chez le collaborateur » en double.
    expectShape(closed, bonDetail);
    expect(closed.equipments.map((e) => e.returnState)).toEqual(['replaced']);
  });

  it('les numéros de série repris de l’original ne sont pas signalés « déjà en circulation »', async () => {
    const original = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const replacement = await ctx.prisma.$transaction((tx) =>
      ctx.app.get(BonsService).createReplacementBon(tx, original.id, '00000000-0000-4000-8000-000000000000', ctx.data.people.technician.id),
    );
    const checks = await ctx.http.get(`/bons/${replacement.id}/send-check`, 'technician');
    expect(checks.status).toBe(200);
    expect(checks.body.serialConflicts).toEqual([]);
  });

  it('le remplaçant est un brouillon lié ; sa remise signée clôture l’original « remplacé »', async () => {
    const original = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const bons = ctx.app.get(BonsService);
    const replacement = await ctx.prisma.$transaction((tx) =>
      bons.createReplacementBon(tx, original.id, '00000000-0000-4000-8000-000000000000', ctx.data.people.technician.id),
    );
    expect(replacement.status).toBe('draft');
    const draft = await itDetail(ctx, replacement.id);
    expect(draft.replaces).toMatchObject({ id: original.id });
    expect((await itDetail(ctx, original.id)).status).toBe('active');

    // Le portail voit que ce bon va être remplacé (il ne propose plus de le contester).
    const portal = await ctx.http.get('/bons/mes-bons', 'collaborator');
    expectShape(portal.body, myBons);
    const mine = portal.body.find((b: { id: string }) => b.id === original.id)!;
    expect(mine.replacedBy).toMatchObject({ id: replacement.id });
    expect(mine).not.toHaveProperty('internalNote');
    expect(mine).not.toHaveProperty('availableActions');

    await ctx.prisma.bonEquipment.updateMany({ where: { bonId: replacement.id }, data: { serialNumber: 'SN-REMPLACANT' } });
    await signIt(ctx, replacement.id, 'mise_disposition');
    await ctx.http.post(`/bons/${replacement.id}/send`, 'technician', { confirmSerialConflicts: true });
    const link = await latestLink(ctx, replacement.id);
    const signed = await signLink(ctx, link.token, 'collaborator');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);

    const closed = await itDetail(ctx, original.id);
    expect(closed).toMatchObject({ status: 'archived', replacedBy: { id: replacement.id } });
  });
});
