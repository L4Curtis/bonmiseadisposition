import { describe, expect, it } from 'vitest';
import { FollowUpBon, FollowUpSignature, linkFollowUp } from '../link-follow-up';

const T0 = new Date('2026-09-28T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function sig(id: string, type: string, createdMin: number, extra: Partial<FollowUpSignature> = {}): FollowUpSignature {
  return {
    id, type, signed: false, signedAt: null, tokenExpiresAt: new Date(0), createdAt: at(createdMin),
    isInPerson: false, pdfType: null, invalidatedAt: at(createdMin + 1), ...extra,
  };
}

/** Bon « Restitution en cours » : un équipement marqué rendu (à signer), un autre encore dehors. */
function bon(signatures: FollowUpSignature[], equipments = [{ returnedAt: at(-10), notReturned: false }, { returnedAt: null, notReturned: false }]): FollowUpBon {
  return { status: 'partially_returned', equipments, signatures };
}

const contested = sig('old', 'restitution', 0);
const link = { id: 'old', type: 'restitution' as const, createdAt: at(0) };

describe('linkFollowUp — ce qui a suivi un lien invalidé', () => {
  it('pendant la correction : la restitution attend toujours, aucun nouveau lien → « link_coming »', () => {
    expect(linkFollowUp(link, bon([contested]))).toBe('link_coming');
  });

  it('corrigée puis renvoyée par email → « link_sent »', () => {
    const resent = sig('new', 'restitution', 30, { tokenExpiresAt: at(10_000), invalidatedAt: null });
    expect(linkFollowUp(link, bon([contested, resent]))).toBe('link_sent');
  });

  it('corrigée puis signée au guichet → « in_person »', () => {
    const atDesk = sig('desk', 'restitution', 30, { isInPerson: true, signed: true, signedAt: at(31) });
    expect(linkFollowUp(link, bon([contested, atDesk]))).toBe('in_person');
  });

  it('plus aucun équipement marqué rendu (marquage annulé) : rien ne partira → « none »', () => {
    const allOut = [{ returnedAt: null, notReturned: false }, { returnedAt: null, notReturned: false }];
    expect(linkFollowUp(link, { ...bon([contested], allOut), status: 'active' })).toBe('none');
  });

  it('un lien plus récent d’un AUTRE document ne compte pas comme un nouveau lien', () => {
    const pv = sig('pv', 'pv_cloture', 30, { tokenExpiresAt: at(10_000), invalidatedAt: null });
    expect(linkFollowUp(link, bon([contested, pv]))).toBe('link_coming');
  });

  it('un lien plus ANCIEN du même document ne compte pas', () => {
    const older = sig('older', 'restitution', -60);
    expect(linkFollowUp(link, bon([older, contested]))).toBe('link_coming');
  });

  it('remise modifiée : lien à venir tant que le bon est « Remise à signer » sans nouveau lien', () => {
    const remise = { id: 'r', type: 'mise_disposition' as const, createdAt: at(0) };
    const b: FollowUpBon = { status: 'sent_mise_dispo', equipments: [{ returnedAt: null, notReturned: false }], signatures: [sig('r', 'mise_disposition', 0)] };
    expect(linkFollowUp(remise, b)).toBe('link_coming');
  });
});
