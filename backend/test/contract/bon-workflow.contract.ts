/**
 * Contrat des actions du cycle de vie d'un bon : création, modification,
 * cachet IT, envoi (et son erreur de conflit de numéros de série), renvois,
 * signature par lien, contestation, restitution, non-restitution, clôture
 * sans signature et annulation. Pour chaque action : la forme de la réponse de
 * succès et, quand le front en affiche une, celle de l'erreur principale.
 *
 * Le parcours principal suit un bon créé ici même, étape après étape : les
 * tests de ce bloc s'exécutent dans l'ordre et dépendent les uns des autres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessRule, describeRule, expectAccessRule, IT, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { DUPLICATE_SERIAL } from './support/fixtures';
import { expectShape } from './support/shape';
import {
  bonDetail,
  initiateInPerson,
  resendBatch,
  resendLink,
  serialConflictsError,
  signIt,
  tokenRecentError,
} from './shapes/bons';
import {
  createContestation,
  resolveContestation,
  reviewContestation,
  signaturePending,
  signDocument,
} from './shapes/workflow';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Plus petit PNG valide (1 × 1 pixel transparent), en data URL. */
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ACCESS: readonly AccessRule[] = [
  rule('POST /bons', IT),
  rule('PUT /bons/:id', IT, (d) => `/bons/${d.bons.draft.id}`),
  rule('DELETE /bons/:id', IT, (d) => `/bons/${d.bons.draft.id}`),
  rule('POST /bons/:id/send', IT, (d) => `/bons/${d.bons.draft.id}/send`),
  rule('POST /bons/:id/sign-it', IT, (d) => `/bons/${d.bons.draft.id}/sign-it`),
  rule('POST /bons/:id/resend', IT, (d) => `/bons/${d.bons.sentMiseDispo.id}/resend`),
  rule('POST /bons/resend-batch', IT),
  rule('POST /bons/:id/initiate-restitution', IT, (d) => `/bons/${d.bons.active.id}/initiate-restitution`),
  rule('POST /bons/:id/initiate-inperson', IT, (d) => `/bons/${d.bons.active.id}/initiate-inperson`),
  rule('POST /bons/:id/declare-not-returned', IT, (d) => `/bons/${d.bons.partiallyReturned.id}/declare-not-returned`),
  rule('POST /bons/:id/mark-found', IT, (d) => `/bons/${d.bons.archived.id}/mark-found`),
  rule('POST /bons/:id/close-unilateral', IT, (d) => `/bons/${d.bons.sentMiseDispo.id}/close-unilateral`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

async function pendingTokenOf(bonId: string): Promise<string> {
  const signature = await ctx.prisma.signature.findFirstOrThrow({
    where: { bonId, signed: false, type: { not: 'it_cachet' } },
    orderBy: { createdAt: 'desc' },
  });
  return signature.token;
}

describe('Parcours d’un bon, de la création à la contestation', () => {
  let bonId = '';
  let contestationId = '';

  it('POST /bons : 201 et la fiche du brouillon', async () => {
    const res = await ctx.http.post('/bons', 'technician', {
      filialeId: ctx.data.filialeId,
      collaborateurId: ctx.data.people.collaborator.id,
      civilite: 'mme',
      dateMiseDisposition: '2026-09-01',
      equipments: [{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: DUPLICATE_SERIAL }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
    bonId = res.body.id;
  });

  // La réservation du brouillon (bons/workflow/bon-crud.ts) doit réellement
  // écrire la ligne : une réservation qui n'écrit rien compte 0 ligne et
  // ferait répondre 409 « plus un brouillon » à toute modification.
  it('PUT /bons/:id sur un brouillon : 200, la fiche modifiée, équipements remplacés', async () => {
    const res = await ctx.http.put(`/bons/${bonId}`, 'technician', {
      notes: 'Livraison au siège',
      equipments: [
        { catalogItemId: ctx.data.catalog.laptopId, serialNumber: DUPLICATE_SERIAL },
        { catalogItemId: ctx.data.catalog.screenId },
      ],
    });
    expect(res.status).toBe(200);
    expectShape(res.body, bonDetail);
    expect(res.body.status).toBe('draft');
    expect(res.body.notes).toBe('Livraison au siège');
    expect(res.body.equipments).toHaveLength(2);
  });

  it('PUT /bons/:id sur un bon qui n’est plus un brouillon : 400', async () => {
    const res = await ctx.http.put(`/bons/${ctx.data.bons.active.id}`, 'technician', { notes: 'Refusé' });
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('POST /bons/:id/sign-it : 201, { ok, bon, signature }', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/sign-it`, 'technician', {
      signatureDataUrl: SIGNATURE_PNG,
      pdfType: 'mise_disposition',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, signIt);
  });

  it('POST /bons/:id/send avec un numéro déjà en circulation : 409 { code, conflicts }, sans statusCode', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/send`, 'technician');
    expect(res.status).toBe(409);
    expectShape(res.body, serialConflictsError);
  });

  it('POST /bons/:id/send en confirmant les conflits : 201 et la fiche envoyée', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/send`, 'technician', { confirmSerialConflicts: true });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
    expect(res.body.status).toBe('sent_mise_dispo');
  });

  it('POST /bons/:id/resend moins d’une heure après l’envoi : 409 { code: token_recent, sentAt }', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/resend`, 'technician');
    expect(res.status).toBe(409);
    expectShape(res.body, tokenRecentError);
  });

  it('POST /bons/:id/resend confirmé : 201 { ok, message }', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/resend`, 'technician', { force: true });
    expect(res.status).toBe(201);
    expectShape(res.body, resendLink);
  });

  it('POST /bons/resend-batch : 200, un compte rendu par bon', async () => {
    const res = await ctx.http.post('/bons/resend-batch', 'technician', { ids: [bonId, ctx.data.bons.draft.id] });
    expect(res.status).toBe(200);
    expectShape(res.body, resendBatch);
  });

  it('GET /signature/:token par le destinataire : lien en attente, bon complet', async () => {
    const token = await pendingTokenOf(bonId);
    const res = await ctx.http.get(`/signature/${token}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signaturePending);
  });

  it('POST /signature/:token/sign : 200 et la signature apposée', async () => {
    const token = await pendingTokenOf(bonId);
    const res = await ctx.http.post(`/signature/${token}/sign`, 'collaborator', {
      signatureDataUrl: SIGNATURE_PNG,
      mentionLuApprouve: true,
    });
    expect(res.status).toBe(200);
    expectShape(res.body, signDocument);
    expect(res.body.bon.status).toBe('active');
  });

  it('POST /bons/:id/contestation par le titulaire : 201 et la contestation ouverte', async () => {
    const res = await ctx.http.post(`/bons/${bonId}/contestation`, 'collaborator', {
      message: 'Le numéro de série ne correspond pas.',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, createContestation);
    contestationId = res.body.id;
  });

  it('PATCH /contestations/:id/review : prise en charge', async () => {
    const res = await ctx.http.patch(`/contestations/${contestationId}/review`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, reviewContestation);
  });

  it('PATCH /contestations/:id/resolve (rejet) : contestation close, bon rétabli', async () => {
    const res = await ctx.http.patch(`/contestations/${contestationId}/resolve`, 'technician', {
      action: 'rejected',
      resolutionMessage: 'Numéro vérifié sur le matériel.',
    });
    expect(res.status).toBe(200);
    expectShape(res.body, resolveContestation);
  });
});

describe('Actions sur les bons du jeu de données', () => {
  it('POST /bons/:id/initiate-inperson : 201 { bon, token }', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.otherCollaboratorActive.id}/initiate-inperson`, 'technician', {
      type: 'restitution',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, initiateInPerson);
  });

  it('POST /bons/:id/initiate-restitution : 201 et la fiche', async () => {
    const { active } = ctx.data.bons;
    const res = await ctx.http.post(`/bons/${active.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: [active.equipmentIds[0]],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
  });

  it('POST /bons/:id/declare-not-returned : 201 et la fiche', async () => {
    const { partiallyReturned } = ctx.data.bons;
    const res = await ctx.http.post(`/bons/${partiallyReturned.id}/declare-not-returned`, 'technician', {
      equipmentIds: [partiallyReturned.equipmentIds[1]],
      reason: 'Écran non rapporté par le collaborateur',
      signatureDataUrl: SIGNATURE_PNG,
    });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
  });

  it('POST /bons/:id/mark-found : 201 et la fiche', async () => {
    const { partiallyReturned } = ctx.data.bons;
    const res = await ctx.http.post(`/bons/${partiallyReturned.id}/mark-found`, 'technician', {
      equipmentIds: [partiallyReturned.equipmentIds[1]],
      signatureDataUrl: SIGNATURE_PNG,
    });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
  });

  it('POST /bons/:id/close-unilateral : 201 et la fiche', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.sentMiseDispo.id}/close-unilateral`, 'technician', {
      reason: 'Remise constatée au guichet, collaborateur injoignable.',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, bonDetail);
  });

  it('POST /bons/:id/close-unilateral sur un bon qui ne l’accepte pas : 400', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.archived.id}/close-unilateral`, 'technician', {
      reason: 'Motif suffisamment long pour la validation.',
    });
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('DELETE /bons/:id : 200 et la fiche annulée', async () => {
    const res = await ctx.http.delete(`/bons/${ctx.data.bons.draft.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, bonDetail);
    expect(res.body.status).toBe('cancelled');
  });
});
