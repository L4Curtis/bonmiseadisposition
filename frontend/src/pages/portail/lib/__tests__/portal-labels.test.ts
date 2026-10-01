import { describe, expect, it } from 'vitest';
import type { PortalBon } from '@/contracts/bons';
import type { DocumentToSign } from '../portal-classification';
import { documentCardTitle, documentSituation, equipmentStateForCollaborator } from '../portal-labels';

function doc(extra: Partial<DocumentToSign>): DocumentToSign {
  return {
    bon: { id: 'b', reference: 'BON-2026-0025' } as PortalBon,
    type: 'restitution',
    token: null,
    requestToken: null,
    since: null,
    inPerson: false,
    expired: true,
    invalidatedReason: null,
    underCorrection: false,
    newLinkRequestedAt: null,
    ...extra,
  };
}

describe('documentSituation — ce que la carte « à signer » dit et propose', () => {
  it('lien valide : signer ; au guichet : attendre le guichet', () => {
    expect(documentSituation(doc({ token: 'tok', expired: false }))).toEqual({ kind: 'sign', token: 'tok' });
    expect(documentSituation(doc({ inPerson: true, expired: false }))).toEqual({ kind: 'in_person' });
  });

  it('restitution contestée puis « Fondée » : bon corrigé puis renvoyé, rien à demander (CM n° 1)', () => {
    expect(documentSituation(doc({ invalidatedReason: 'contested', underCorrection: true }))).toEqual({
      kind: 'correction',
      message:
        "Votre contestation est fondée : votre bon va être corrigé, puis la restitution vous sera renvoyée à signer. Vous n'avez rien à faire d'ici là.",
    });
    expect(
      documentSituation(doc({ type: 'pv_cloture', invalidatedReason: 'contested', underCorrection: true })),
    ).toMatchObject({ kind: 'correction', message: expect.stringContaining('le PV de non-restitution vous sera renvoyé à signer') });
  });

  it('remise contestée puis « Fondée » : un bon corrigé remplace celui-ci (pas « la remise vous sera renvoyée »)', () => {
    expect(
      documentSituation(doc({ type: 'mise_disposition', invalidatedReason: 'contested', underCorrection: true })),
    ).toEqual({
      kind: 'correction',
      message:
        "Votre contestation est fondée : un bon corrigé va remplacer celui-ci, vous le recevrez à signer. Vous n'avez rien à faire d'ici là.",
    });
  });

  it('bon modifié : le même motif que la page du lien, jamais « lien expiré » (R-038)', () => {
    expect(documentSituation(doc({ type: 'mise_disposition', invalidatedReason: 'modified' }))).toEqual({
      kind: 'invalidated',
      message: 'Ce bon a été modifié : un nouveau lien vous sera envoyé.',
    });
  });

  it('lien expiré : « Demander un nouveau lien », ou la demande déjà faite avec sa date', () => {
    expect(documentSituation(doc({ requestToken: 'tok-expire' }))).toEqual({ kind: 'expired', requestToken: 'tok-expire' });
    expect(documentSituation(doc({ requestToken: 'tok-expire', newLinkRequestedAt: '2026-09-27T09:30:00Z' }))).toEqual({
      kind: 'requested',
      message: "Nouveau lien demandé le 27 septembre 2026 — l'équipe informatique va vous le renvoyer.",
    });
    expect(documentSituation(doc({}))).toEqual({ kind: 'expired', requestToken: null });
  });
});

describe('equipmentStateForCollaborator', () => {
  it('marquage contesté en cours de correction : ni « Rendu » ni « Déclaré non restitué »', () => {
    expect(equipmentStateForCollaborator({ returnState: 'returned_to_sign' }, true)).toEqual({
      label: 'En cours de correction',
      tone: 'to_sign',
    });
    expect(equipmentStateForCollaborator({ returnState: 'not_returned' }, true).label).toBe('En cours de correction');
    expect(equipmentStateForCollaborator({ returnState: 'returned' }, true).label).toBe('Rendu');
    expect(equipmentStateForCollaborator({ returnState: 'returned_to_sign' }).label).toBe('Rendu — restitution à signer');
  });
});

describe('documentCardTitle — le titre ne contredit jamais la situation (R5)', () => {
  it('document à signer : « … à signer »', () => {
    expect(documentCardTitle(doc({ token: 'tok', expired: false }))).toBe('Bon de restitution à signer');
  });

  it('en cours de correction : plus « à signer »', () => {
    expect(documentCardTitle(doc({ invalidatedReason: 'contested', underCorrection: true }))).toBe('Restitution en cours de correction');
    expect(documentCardTitle(doc({ type: 'pv_cloture', invalidatedReason: 'contested', underCorrection: true }))).toBe(
      'PV de non-restitution en cours de correction',
    );
  });

  it('nouveau lien à venir (bon modifié, lien déjà redemandé) : « en attente d’un nouveau lien »', () => {
    expect(documentCardTitle(doc({ type: 'mise_disposition', invalidatedReason: 'modified' }))).toBe(
      'Bon de mise à disposition en attente d’un nouveau lien',
    );
    expect(documentCardTitle(doc({ newLinkRequestedAt: '2026-09-27T09:30:00Z' }))).toBe('Bon de restitution en attente d’un nouveau lien');
  });
});

