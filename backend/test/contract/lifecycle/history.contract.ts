/**
 * Historique d'un bon, sur une vraie base : chaque geste y est raconté par
 * une phrase qui dit la vérité.
 *  - Une signature au guichet est celle du collaborateur, faite devant le
 *    technicien : « Camille … a signé …, au guichet, en présence de Thomas … ».
 *  - La remise au guichet ne prétend pas qu'un email est parti.
 *  - Le premier envoi d'un lien (restitution, nouvelle version après
 *    modification) n'est pas un « renvoi » ; un renvoi l'est.
 *  - La clôture et la modification d'un brouillon y figurent.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContractContext, startContractContext } from '../support/context';
import { createActiveBon, signIt, signLink } from './helpers';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

interface HistoryItem {
  action: string;
  label: string;
  sentence: string;
  actorName: string | null;
}

async function history(bonId: string): Promise<HistoryItem[]> {
  const res = await ctx.http.get(`/bons/${bonId}/history`, 'technician');
  expect(res.status).toBe(200);
  return res.body.items as HistoryItem[];
}

function only(items: readonly HistoryItem[], action: string): HistoryItem {
  const found = items.filter((i) => i.action === action);
  expect(found, `${action} dans ${JSON.stringify(items.map((i) => i.action))}`).toHaveLength(1);
  return found[0];
}

async function createDraft() {
  const res = await ctx.http.post('/bons', 'technician', {
    filialeId: ctx.data.filialeId,
    collaborateurId: ctx.data.people.collaborator.id,
    civilite: 'mme',
    dateMiseDisposition: '2026-09-20',
    dateRestitution: '2026-11-02',
    equipments: [{ catalogItemId: ctx.data.catalog.laptopId, serialNumber: `SN-HIST-${Date.now()}` }],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; reference: string };
}

describe('Historique : signature au guichet', () => {
  it('la restitution signée au guichet est attribuée au collaborateur, en présence du technicien ; la clôture suit', async () => {
    const { collaborator, technician } = ctx.data.people;
    const bon = await createActiveBon(ctx, collaborator, 2);
    const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: bon.equipmentIds,
      inPerson: true,
    });
    expect(marked.status).toBe(201);
    await signIt(ctx, bon.id, 'restitution');
    const link = await ctx.http.post(`/bons/${bon.id}/initiate-inperson`, 'technician', { type: 'restitution' });
    expect(link.status).toBe(201);
    const signed = await signLink(ctx, link.body.token, 'technician');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);

    const items = await history(bon.id);
    const signature = only(items, 'signed_restitution');
    expect(signature.actorName).toBe(collaborator.displayName);
    expect(signature.sentence).toBe(
      `${collaborator.displayName} a signé la restitution du bon ${marked.body.reference}, au guichet, en présence de ${technician.displayName}.`,
    );

    const closed = only(items, 'bon_closed');
    expect(closed.sentence).toBe(`Le système a clôturé le bon ${marked.body.reference} (restitution complète signée).`);
    expect(items.indexOf(closed)).toBeGreaterThan(items.indexOf(signature));
  });

  it('la remise au guichet dit « au guichet », jamais « Bon envoyé » ; la signature revient au collaborateur', async () => {
    const { collaborator, technician } = ctx.data.people;
    const draft = await createDraft();
    await signIt(ctx, draft.id, 'mise_disposition');
    const link = await ctx.http.post(`/bons/${draft.id}/initiate-inperson`, 'technician', { type: 'mise_disposition' });
    expect(link.status, JSON.stringify(link.body)).toBe(201);
    const signed = await signLink(ctx, link.body.token, 'technician');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);

    const items = await history(draft.id);
    const handover = only(items, 'bon_sent');
    expect(handover.label).not.toBe('Bon envoyé');
    expect(handover.sentence).toContain('au guichet');
    expect(handover.sentence).not.toMatch(/email/);
    expect(only(items, 'signed_mise_disposition').sentence).toBe(
      `${collaborator.displayName} a signé la mise à disposition du bon ${draft.reference}, au guichet, en présence de ${technician.displayName}.`,
    );
  });

  it('une signature à distance reste celle du collaborateur, sans mention de guichet', async () => {
    const { collaborator } = ctx.data.people;
    const draft = await createDraft();
    await signIt(ctx, draft.id, 'mise_disposition');
    expect((await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {})).status).toBe(201);
    const token = (await ctx.prisma.signature.findFirstOrThrow({ where: { bonId: draft.id, type: 'mise_disposition' } })).token;
    expect((await signLink(ctx, token, 'collaborator')).status).toBe(200);

    const items = await history(draft.id);
    expect(only(items, 'bon_sent').sentence).toContain('par email');
    expect(only(items, 'signed_mise_disposition').sentence).toBe(
      `${collaborator.displayName} a signé la mise à disposition du bon ${draft.reference}.`,
    );
  });
});

describe('Historique : premier envoi et renvoi', () => {
  it('le premier lien de restitution est un envoi ; le suivant, un renvoi', async () => {
    const bon = await createActiveBon(ctx, ctx.data.people.collaborator, 1);
    const marked = await ctx.http.post(`/bons/${bon.id}/initiate-restitution`, 'technician', {
      returnedEquipmentIds: bon.equipmentIds,
    });
    expect(marked.status).toBe(201);
    await signIt(ctx, bon.id, 'restitution');
    expect((await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', {})).status).toBe(201);

    let items = await history(bon.id);
    const first = only(items, 'signature_link_sent');
    expect(first.sentence).toBe(
      `${ctx.data.people.technician.displayName} a envoyé par email le lien de signature de la restitution du bon ${marked.body.reference}.`,
    );
    expect(items.some((i) => i.action === 'reminder_sent')).toBe(false);

    // Hors de la fenêtre anti double clic (30 s), où le lien serait réutilisé sans email.
    await ctx.prisma.signature.updateMany({
      where: { bonId: bon.id, type: 'restitution' },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });
    expect((await ctx.http.post(`/bons/${bon.id}/resend`, 'technician', { force: true })).status).toBe(201);
    items = await history(bon.id);
    const again = only(items, 'reminder_sent');
    expect(again.label).toBe('Lien renvoyé');
    expect(again.sentence).toBe(
      `${ctx.data.people.technician.displayName} a renvoyé par email le lien de signature de la restitution du bon ${marked.body.reference}.`,
    );
  });

  it('le lien qui suit une modification après envoi est un nouvel envoi, pas un renvoi', async () => {
    const draft = await createDraft();
    await signIt(ctx, draft.id, 'mise_disposition');
    expect((await ctx.http.post(`/bons/${draft.id}/send`, 'technician', {})).status).toBe(201);
    const modified = await ctx.http.patch(`/bons/${draft.id}`, 'technician', { dateRestitution: '2026-11-16' });
    expect(modified.status, JSON.stringify(modified.body)).toBe(200);
    await signIt(ctx, draft.id, 'mise_disposition');
    expect((await ctx.http.post(`/bons/${draft.id}/resend`, 'technician', {})).status).toBe(201);

    const items = await history(draft.id);
    expect(only(items, 'signature_link_sent').sentence).toContain('de la mise à disposition');
    expect(items.some((i) => i.action === 'reminder_sent')).toBe(false);
    expect(only(items, 'bon_modified_after_send').sentence).toContain('restitution prévue');
  });
});

describe('Historique : modification d’un brouillon', () => {
  it('la modification d’un brouillon est tracée, avec les champs changés', async () => {
    const draft = await createDraft();
    const res = await ctx.http.patch(`/bons/${draft.id}`, 'technician', { dateRestitution: '2026-11-09', notes: 'Chargeur fourni' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const updated = only(await history(draft.id), 'bon_updated');
    expect(updated.sentence).toBe(
      `${ctx.data.people.technician.displayName} a modifié le bon ${draft.reference} (restitution prévue, remarques).`,
    );
  });

  it('une modification qui ne change rien n’est pas tracée', async () => {
    const draft = await createDraft();
    const res = await ctx.http.patch(`/bons/${draft.id}`, 'technician', { dateRestitution: '2026-11-02' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await history(draft.id)).some((i) => i.action === 'bon_updated')).toBe(false);
  });
});

describe('Historique : entrées écrites avant cette version (migration 20261002100000)', () => {
  const MIGRATION = resolve(__dirname, '../../../prisma/migrations/20261002100000_audit_history_truth/migration.sql');

  /** Rejoue la migration (idempotente), instruction par instruction. */
  async function replayMigration(): Promise<void> {
    const statements = readFileSync(MIGRATION, 'utf8')
      .split(/;\s*\n/)
      .map((sql) => sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim())
      .filter((sql) => sql.length > 0);
    for (const sql of statements) await ctx.prisma.$executeRawUnsafe(sql);
  }

  it('remise et signature au guichet anciennes : la voie et le vrai signataire, sans toucher aux autres', async () => {
    const { collaborator, technician } = ctx.data.people;
    const bon = await createActiveBon(ctx, collaborator, 1);
    const reference = (await ctx.prisma.bon.findUniqueOrThrow({ where: { id: bon.id } })).reference;
    await ctx.prisma.auditLog.createMany({
      data: [
        { action: 'bon_sent', bonId: bon.id, userId: technician.id, details: { inPerson: true } },
        {
          action: 'signed_mise_disposition', bonId: bon.id, userEmail: technician.email,
          details: { isInPerson: true, signedByProxy: false, titulaireEmail: collaborator.email },
        },
        { action: 'reminder_sent', bonId: bon.id, userId: technician.id, details: { manual: true, document: 'restitution' } },
      ],
    });

    await replayMigration();
    await replayMigration();

    const items = await history(bon.id);
    expect(only(items, 'bon_sent').sentence).toContain(', lien de signature au guichet.');
    const signature = only(items, 'signed_mise_disposition');
    expect(signature.actorName).toBe(collaborator.displayName);
    expect(signature.sentence).toBe(
      `${collaborator.displayName} a signé la mise à disposition du bon ${reference}, au guichet, en présence de ${technician.displayName}.`,
    );
    expect(only(items, 'reminder_sent').sentence).toContain('le lien de signature de la restitution');
  });

  it('ne touche ni aux signatures à distance, ni au titulaire sur son compte ; le mandataire reste l’auteur', async () => {
    const { collaborator, otherCollaborator } = ctx.data.people;
    const bon = await createActiveBon(ctx, collaborator, 1);
    const reference = (await ctx.prisma.bon.findUniqueOrThrow({ where: { id: bon.id } })).reference;
    const signed = { isInPerson: false, signedByProxy: false, titulaireEmail: collaborator.email };
    await ctx.prisma.auditLog.createMany({
      data: [
        { action: 'signed_mise_disposition', bonId: bon.id, userEmail: collaborator.email, details: signed },
        { action: 'signed_restitution', bonId: bon.id, userEmail: collaborator.email, details: { ...signed, isInPerson: true } },
        {
          action: 'signed_pv_cloture', bonId: bon.id, userEmail: otherCollaborator.email,
          details: { ...signed, isInPerson: true, signedByProxy: true },
        },
      ],
    });

    await replayMigration();

    const items = await history(bon.id);
    expect(only(items, 'signed_mise_disposition').sentence).toBe(
      `${collaborator.displayName} a signé la mise à disposition du bon ${reference}.`,
    );
    expect(only(items, 'signed_restitution').sentence).toBe(
      `${collaborator.displayName} a signé la restitution du bon ${reference}, au guichet.`,
    );
    const proxy = only(items, 'signed_pv_cloture');
    expect(proxy.actorName).toBe(otherCollaborator.displayName);
    expect(proxy.sentence).toContain(`au guichet, pour le compte de ${collaborator.displayName} (mandataire)`);
  });
});
