/**
 * Contrat des contestations : liste de l'écran IT et ses compteurs, suivi par
 * le collaborateur, contestation de la remise, de la restitution et du PV,
 * décision Fondée / Non retenue (remise Fondée : bon remplaçant ; restitution
 * ou PV Fondé : bon d'origine rouvert pour correction), relance à 7 jours
 * ouvrés. Le parcours complet d'un
 * bon jusqu'à sa contestation est aussi joué par bon-workflow.contract.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContestationOverdueService } from '../../src/contestation/overdue/contestation-overdue.service';
import { AccessRule, describeRule, EVERY_ROLE, expectAccessRule, IT, rule } from './support/access';
import { apiError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { PENDING_RESTITUTION_TOKEN } from './support/fixtures';
import { expectShape } from './support/shape';
import {
  contestationList,
  createContestation,
  myContestations,
  resolveContestation,
  reviewContestation,
  signatureBonClosed,
  signaturePending,
  signatureReplaced,
} from './shapes/workflow';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Nouveaux chemins, puis anciens (alias dépréciés) : mêmes droits. */
const ACCESS: readonly AccessRule[] = [
  rule('GET /contestations', IT),
  rule('GET /me/contestations', EVERY_ROLE),
  rule('GET /contestations/mine', EVERY_ROLE),
  rule('POST /contestations/:id/review', IT, () => `/contestations/${UNKNOWN_ID}/review`),
  rule('POST /contestations/:id/resolve', IT, () => `/contestations/${UNKNOWN_ID}/resolve`),
  rule('PATCH /contestations/:id/review', IT, () => `/contestations/${UNKNOWN_ID}/review`),
  rule('PATCH /contestations/:id/resolve', IT, () => `/contestations/${UNKNOWN_ID}/resolve`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Liste de l’équipe informatique', () => {
  it('GET /contestations : la liste et ses compteurs globaux', async () => {
    const res = await ctx.http.get('/contestations?page=1&limit=25', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, contestationList);
    expect(res.body.meta?.overdueAfterDays).toBe(7);
    expect(res.body.meta?.pendingCount).toBeGreaterThanOrEqual(res.body.meta?.openCount ?? Infinity);
  });

  it('GET /contestations?status=open,in_review (« À traiter ») : seulement les non tranchées', async () => {
    const res = await ctx.http.get('/contestations?status=open,in_review', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, contestationList);
    const statuses = (res.body.items as { status: string }[]).map((c) => c.status);
    expect(statuses.every((s) => s === 'open' || s === 'in_review')).toBe(true);
    expect(res.body.total).toBe(res.body.meta?.pendingCount);
  });

  it('GET /contestations?aTraiter=1 : autant de lignes que la tuile « Contestations à traiter » de l’accueil', async () => {
    const [list, today] = await Promise.all([
      ctx.http.get('/contestations?aTraiter=1&limit=100', 'technician'),
      ctx.http.get('/kpi/aujourdhui', 'technician'),
    ]);
    expect(list.status).toBe(200);
    expectShape(list.body, contestationList);
    const tile = (today.body as { toDo: { contestations: { total: number } } }).toDo.contestations.total;
    expect(tile).toBeGreaterThan(0);
    expect(list.body.total).toBe(tile);
    expect(list.body.items).toHaveLength(tile);
    const statuses = (list.body.items as { status: string }[]).map((c) => c.status);
    expect(statuses.every((s) => s === 'open' || s === 'in_review')).toBe(true);
  });

  it('GET /contestations?limit=20 : 400 validation_failed (25, 50 ou 100)', async () => {
    const res = await ctx.http.get('/contestations?limit=20', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('validation_failed');
  });

  it('GET /contestations?status=inconnu : 400', async () => {
    const res = await ctx.http.get('/contestations?status=open,inconnu', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });
});

describe('Création par le collaborateur', () => {
  it('sans session : 401', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'anonymous', { message: 'x' });
    expect(res.status).toBe(401);
  });

  it('sur le bon d’un autre : 403', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'otherCollaborator', {
      message: 'Ce bon n’est pas le mien.',
    });
    expect(res.status).toBe(403);
    expectShape(res.body, apiError);
  });

  it('par un technicien, même sur un bon qu’il voit : 403', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'technician', {
      message: 'Je ne suis pas le titulaire.',
    });
    expect(res.status).toBe(403);
  });

  it('sur un bon clôturé : 400 avec un message pour le collaborateur', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.archived.id}/contestation`, 'collaborator', {
      message: 'Trop tard.',
    });
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });

  it('sur une remise pas encore signée : 400 « ne le signez pas »', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.sentMiseDispo.id}/contestation`, 'collaborator', {
      message: 'Il manque un câble.',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ne le signez pas/);
  });

  it('motif fait d’espaces : 400', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'collaborator', {
      message: '   ',
    });
    expect(res.status).toBe(400);
  });

  it('document annoncé qui n’est pas le bon : 409', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.active.id}/contestation`, 'collaborator', {
      message: 'Restitution fausse.',
      document: 'restitution',
    });
    expect(res.status).toBe(409);
  });
});

describe('Restitution contestée puis Non retenue : rien ne change', () => {
  let contestationId = '';

  it('POST /bons/:id/contestation au moment de signer la restitution : document « restitution »', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.sentRestitution.id}/contestation`, 'collaborator', {
      message: 'J’ai rendu aussi la sacoche.',
      document: 'restitution',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, createContestation);
    expect(res.body.contestedDocument).toBe('restitution');
    expect(res.body.previousBonStatus).toBe('sent_restitution');
    contestationId = res.body.id;
  });

  it('le lien de restitution annonce la contestation, sans avoir été invalidé', async () => {
    const res = await ctx.http.get(`/signature/${PENDING_RESTITUTION_TOKEN}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signatureBonClosed);
    expect(res.body.status).toBe('contested');
  });

  it('une seconde contestation du même bon : 409', async () => {
    const res = await ctx.http.post(`/bons/${ctx.data.bons.sentRestitution.id}/contestation`, 'collaborator', {
      message: 'Encore.',
    });
    expect(res.status).toBe(409);
  });

  it('GET /me/contestations : le collaborateur revoit son motif, « envoyée »', async () => {
    const res = await ctx.http.get('/me/contestations', 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, myContestations);
    const mine = (res.body.items as { id: string; message: string; status: string }[]).find((c) => c.id === contestationId);
    expect(mine?.message).toBe('J’ai rendu aussi la sacoche.');
    expect(mine?.status).toBe('open');
    expect(JSON.stringify(res.body)).not.toContain(ctx.data.people.technician.displayName);
  });

  it('GET /me/contestations d’un autre collaborateur : pas cette contestation', async () => {
    const res = await ctx.http.get('/me/contestations', 'otherCollaborator');
    expect(res.status).toBe(200);
    expect((res.body.items as { id: string }[]).some((c) => c.id === contestationId)).toBe(false);
  });

  it('PATCH /contestations/:id/review : « pris en charge par » renseigné, « tranché par » vide', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/review`, 'technician');
    expect(res.status).toBe(201);
    expectShape(res.body, reviewContestation);
    expect(res.body.reviewedBy.id).toBe(ctx.data.people.technician.id);
    expect(res.body.resolvedBy).toBeNull();
  });

  it('une seconde prise en charge : 409 contestation_already_handled, qui nomme le collègue', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/review`, 'admin');
    expect(res.status).toBe(409);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('contestation_already_handled');
    const name = ctx.data.people.technician.displayName;
    expect(res.body.message).toBe(`Cette contestation est déjà prise en charge par ${name}.`);
    expect(res.body.details).toEqual({ status: 'in_review', outcome: null, by: name });
  });

  it('PATCH /contestations/:id/review (ancien verbe) : même traitement, avec Deprecation et Link', async () => {
    const res = await ctx.http.patch(`/contestations/${contestationId}/review`, 'admin');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('contestation_already_handled');
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe(`</api/contestations/${contestationId}/review>; rel="successor-version"`);
  });

  it('GET /contestations/mine (ancien chemin) : même réponse que /me/contestations, avec Deprecation', async () => {
    const [current, legacy] = await Promise.all([
      ctx.http.get('/me/contestations', 'collaborator'),
      ctx.http.get('/contestations/mine', 'collaborator'),
    ]);
    expect(legacy.status).toBe(200);
    expect(legacy.body).toEqual(current.body);
    expect(legacy.headers.deprecation).toBe('true');
    expect(legacy.headers.link).toBe('</api/me/contestations>; rel="successor-version"');
  });

  it('Non retenue sans réponse au collaborateur : 400', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'admin', {
      outcome: 'not_retained',
      resolutionMessage: '  ',
    });
    expect(res.status).toBe(400);
  });

  it('Non retenue : le bon reprend « Restitution à signer », « tranché par » l’admin', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'admin', {
      outcome: 'not_retained',
      resolutionMessage: 'La sacoche n’est pas arrivée au stock.',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, resolveContestation);
    expect(res.body.outcome).toBe('not_retained');
    expect(res.body.status).toBe('rejected');
    expect(res.body.bon.status).toBe('sent_restitution');
    expect(res.body.reviewedBy?.id).toBe(ctx.data.people.technician.id);
    expect(res.body.resolvedBy.id).toBe(ctx.data.people.admin.id);
    expect(res.body.replacementBon).toBeNull();
  });

  it('le même lien de restitution se signe de nouveau', async () => {
    const res = await ctx.http.get(`/signature/${PENDING_RESTITUTION_TOKEN}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signaturePending);
  });

  it('une seconde décision : 409', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'admin', { outcome: 'founded' });
    expect(res.status).toBe(409);
  });

  it('outcome inconnu (ancienne API « action ») : 400', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'admin', { action: 'rejected' });
    expect(res.status).toBe(400);
  });
});

describe('Restitution contestée puis Fondée : le bon d’origine est corrigé, sans nouveau bon', () => {
  let contestationId = '';
  const bonId = () => ctx.data.bons.sentRestitution.id;

  it('le titulaire conteste de nouveau la restitution, une fois la première non retenue', async () => {
    const res = await ctx.http.post(`/bons/${bonId()}/contestation`, 'collaborator', {
      message: 'La sacoche a bien été rendue, voici le bon de dépôt.',
      document: 'restitution',
    });
    expect(res.status).toBe(201);
    expect(res.body.contestedDocument).toBe('restitution');
    contestationId = res.body.id;
  });

  it('Fondée : le bon reprend « Restitution à signer », rouvert pour correction, aucun remplaçant', async () => {
    const bonsBefore = await ctx.prisma.bon.count();
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'technician', {
      outcome: 'founded',
      resolutionMessage: 'Vous avez raison, nous corrigeons la restitution.',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, resolveContestation);
    expect(res.body.outcome).toBe('founded');
    expect(res.body.bon.status).toBe('sent_restitution');
    expect(res.body.replacementBon).toBeNull();
    expect(res.body.reopenedDocument).toBe('restitution');
    expect(await ctx.prisma.bon.count()).toBe(bonsBefore);
    expect(await ctx.prisma.bon.count({ where: { replacesBonId: bonId() } })).toBe(0);
  });

  it('le lien de restitution ne se signe plus : invalidé, motif « contestation fondée »', async () => {
    const link = await ctx.prisma.signature.findFirstOrThrow({ where: { token: PENDING_RESTITUTION_TOKEN } });
    expect(link.invalidatedReason).toBe('contested');
    expect(link.signed).toBe(false);
    const res = await ctx.http.get(`/signature/${PENDING_RESTITUTION_TOKEN}`, 'collaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, signatureReplaced);
    expect(res.body.invalidatedReason).toBe('contested');
  });

  it('le journal du bon trace la réouverture pour correction', async () => {
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { bonId: bonId(), action: 'bon_reopened_for_correction' },
    });
    expect(audit?.details).toEqual({ document: 'restitution' });
  });
});

describe('PV contesté au moment de le signer, puis Fondé', () => {
  let contestationId = '';
  const bonId = () => ctx.data.bons.partiallyReturned.id;
  const pvToken = `jeton-contrat-pv-conteste-${Date.now()}`;

  it('POST /bons/:id/contestation sur un PV à signer : document « pv_cloture »', async () => {
    // Situation réelle d'un PV à signer : l'équipement rendu est couvert par
    // la restitution signée, celui encore sorti est déclaré non restitué,
    // puis le PV part.
    await ctx.prisma.bonEquipment.updateMany({
      where: { bonId: bonId(), returnedAt: { not: null } },
      data: { returnedAt: new Date(Date.now() - 30 * DAY_MS) },
    });
    await ctx.prisma.bonEquipment.updateMany({
      where: { bonId: bonId(), returnedAt: null },
      data: { notReturned: true, notReturnedReason: 'Déclaré perdu' },
    });
    await ctx.prisma.signature.create({
      data: { bonId: bonId(), type: 'pv_cloture', token: pvToken, tokenExpiresAt: new Date(Date.now() + 7 * DAY_MS) },
    });
    const res = await ctx.http.post(`/bons/${bonId()}/contestation`, 'collaborator', {
      message: 'L’écran déclaré perdu a été rendu au guichet.',
      document: 'pv_cloture',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, createContestation);
    expect(res.body.contestedDocument).toBe('pv_cloture');
    expect(res.body.previousBonStatus).toBe('partially_returned');
    contestationId = res.body.id;
  });

  it('Fondée : le bon reprend « Restitution en cours », le lien du PV est invalidé, aucun remplaçant', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'admin', { outcome: 'founded' });
    expect(res.status).toBe(201);
    expectShape(res.body, resolveContestation);
    expect(res.body.bon.status).toBe('partially_returned');
    expect(res.body.replacementBon).toBeNull();
    expect(res.body.reopenedDocument).toBe('pv_cloture');
    const link = await ctx.prisma.signature.findFirstOrThrow({ where: { token: pvToken } });
    expect(link.invalidatedReason).toBe('contested');
    expect(await ctx.prisma.bon.count({ where: { replacesBonId: bonId() } })).toBe(0);
  });
});

describe('Remise contestée puis Fondée : correction par un bon remplaçant', () => {
  let contestationId = '';
  const bonId = () => ctx.data.bons.otherCollaboratorActive.id;

  it('le titulaire conteste la remise de son bon « En cours »', async () => {
    const res = await ctx.http.post(`/bons/${bonId()}/contestation`, 'otherCollaborator', {
      message: 'Le numéro de série du portable est faux.',
    });
    expect(res.status).toBe(201);
    expect(res.body.contestedDocument).toBe('mise_disposition');
    contestationId = res.body.id;
  });

  it('Fondée (sans prise en charge préalable) : l’original reste « En cours », un remplaçant est créé', async () => {
    const res = await ctx.http.post(`/contestations/${contestationId}/resolve`, 'technician', {
      outcome: 'founded',
      resolutionMessage: 'Numéro corrigé sur un nouveau bon.',
    });
    expect(res.status).toBe(201);
    expectShape(res.body, resolveContestation);
    expect(res.body.outcome).toBe('founded');
    expect(res.body.status).toBe('resolved');
    expect(res.body.bon.status).toBe('active');
    expect(res.body.reviewedBy).toBeNull();
    expect(res.body.replacementBon).not.toBeNull();
    expect(res.body.reopenedDocument).toBeNull();

    const replacementId = res.body.replacementBon?.id ?? '';
    const replacement = await ctx.prisma.bon.findUniqueOrThrow({ where: { id: replacementId } });
    expect(replacement.replacesBonId).toBe(bonId());
    expect(replacement.collaborateurId).toBe(ctx.data.people.otherCollaborator.id);
  });

  it('le collaborateur voit l’issue, la réponse et le bon remplaçant', async () => {
    const res = await ctx.http.get('/me/contestations', 'otherCollaborator');
    expect(res.status).toBe(200);
    expectShape(res.body, myContestations);
    const mine = (res.body.items as { id: string; outcome: string; replacementBon: unknown }[]).find(
      (c) => c.id === contestationId,
    );
    expect(mine?.outcome).toBe('founded');
    expect(mine?.replacementBon).not.toBeNull();
  });
});

describe('Relance de l’équipe informatique à 7 jours ouvrés', () => {
  it('seules les contestations non tranchées depuis plus de 7 jours ouvrés sont relancées, une fois par période', async () => {
    const overdueBonId = ctx.data.bons.departedActive.id;
    await ctx.prisma.contestation.create({
      data: {
        bonId: overdueBonId,
        userId: ctx.data.people.departed.id,
        message: 'Contestation oubliée.',
        // 15 jours de calendrier : plus de 7 jours ouvrés quel que soit le jour.
        createdAt: new Date(Date.now() - 15 * DAY_MS),
      },
    });
    const overdue = ctx.app.get(ContestationOverdueService);

    const first = await overdue.run();
    expect(first.overdue).toBeGreaterThanOrEqual(1);
    const logs = await ctx.prisma.notificationLog.findMany({ where: { type: 'contestation_overdue_alert' } });
    expect(logs.map((l) => l.bonId)).toContain(overdueBonId);
    // La contestation récente du jeu de données n'est pas relancée.
    expect(logs.map((l) => l.bonId)).not.toContain(ctx.data.bons.contested.id);

    // Relance réussie il y a peu : pas de nouvel email pour ce bon.
    await ctx.prisma.notificationLog.create({
      data: { bonId: overdueBonId, recipientEmail: 'it@example.test', type: 'contestation_overdue_alert', status: 'sent' },
    });
    const before = await ctx.prisma.notificationLog.count({ where: { bonId: overdueBonId, type: 'contestation_overdue_alert' } });
    await overdue.run();
    const after = await ctx.prisma.notificationLog.count({ where: { bonId: overdueBonId, type: 'contestation_overdue_alert' } });
    expect(after).toBe(before);
  });

  it('la liste IT compte la contestation en retard', async () => {
    const res = await ctx.http.get('/contestations', 'technician');
    expect(res.status).toBe(200);
    expect(res.body.meta.overdueCount).toBeGreaterThanOrEqual(1);
    // Seuil de retard calculé par le serveur (jours ouvrés), repris tel quel par l'écran.
    expect(new Date(res.body.meta.overdueSince).getTime()).toBeLessThan(Date.now() - 7 * DAY_MS + 1000);
  });
});
