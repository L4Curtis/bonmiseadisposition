import { describe, it, expect } from 'vitest';
import { findPendingSignable, groupBons, hasPendingSignable, signatureTypeLabel } from '../bonsFilters';
import type { BonCollab } from '../../types';

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

function makeBon(overrides: Partial<BonCollab>): BonCollab {
  return {
    id: 'b1',
    reference: 'BDM-1',
    status: 'active',
    civilite: 'mr',
    dateMiseDisposition: '2026-01-01',
    filiale: { displayName: 'Siège' },
    equipments: [],
    signatures: [],
    ...overrides,
  };
}

describe('findPendingSignable / hasPendingSignable', () => {
  it('finds a non-signed, non-expired, signable signature', () => {
    const bon = makeBon({
      status: 'partially_returned',
      signatures: [{ id: 's1', type: 'restitution', signed: false, token: 'tok-1', tokenExpiresAt: future }],
    });
    expect(findPendingSignable(bon)?.id).toBe('s1');
    expect(hasPendingSignable(bon)).toBe(true);
  });

  it('ignores an expired signature', () => {
    const bon = makeBon({
      signatures: [{ id: 's1', type: 'restitution', signed: false, token: 'tok-1', tokenExpiresAt: past }],
    });
    expect(hasPendingSignable(bon)).toBe(false);
  });

  it('ignores an already-signed signature', () => {
    const bon = makeBon({
      signatures: [{ id: 's1', type: 'restitution', signed: true, token: 'tok-1', tokenExpiresAt: future }],
    });
    expect(hasPendingSignable(bon)).toBe(false);
  });

  it('ignores a non-signable type (it_cachet)', () => {
    const bon = makeBon({
      signatures: [{ id: 's1', type: 'it_cachet', signed: false, token: 'tok-1', tokenExpiresAt: future }],
    });
    expect(hasPendingSignable(bon)).toBe(false);
  });
});

describe('signatureTypeLabel', () => {
  it('labels pv_cloture, restitution, and anything else', () => {
    expect(signatureTypeLabel('pv_cloture')).toBe('procès-verbal d\'équipements non restitués');
    expect(signatureTypeLabel('restitution')).toBe('restitution');
    expect(signatureTypeLabel('mise_disposition')).toBe('mise à disposition');
  });
});

describe('groupBons', () => {
  it('puts sent_mise_dispo and sent_restitution bons under pending', () => {
    const sent1 = makeBon({ id: 'b1', status: 'sent_mise_dispo' });
    const sent2 = makeBon({ id: 'b2', status: 'sent_restitution' });
    const { pending } = groupBons([sent1, sent2]);
    expect(pending.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('puts a partially_returned bon under pending only if it has a pending signable signature', () => {
    const withSig = makeBon({
      id: 'b1',
      status: 'partially_returned',
      signatures: [{ id: 's1', type: 'pv_cloture', signed: false, token: 'tok-1', tokenExpiresAt: future }],
    });
    const withoutSig = makeBon({ id: 'b2', status: 'partially_returned', signatures: [] });
    const groups = groupBons([withSig, withoutSig]);
    expect(groups.pending.map((b) => b.id)).toEqual(['b1']);
    expect(groups.others.map((b) => b.id)).toEqual(['b2']);
  });

  it('separates active and contested bons, and puts the rest in others', () => {
    const active = makeBon({ id: 'b1', status: 'active' });
    const contested = makeBon({ id: 'b2', status: 'contested' });
    const archived = makeBon({ id: 'b3', status: 'archived' });
    const groups = groupBons([active, contested, archived]);
    expect(groups.active.map((b) => b.id)).toEqual(['b1']);
    expect(groups.contested.map((b) => b.id)).toEqual(['b2']);
    expect(groups.others.map((b) => b.id)).toEqual(['b3']);
  });

  it('returns empty groups for an empty list', () => {
    expect(groupBons([])).toEqual({ pending: [], active: [], contested: [], others: [] });
  });
});
