import { describe, it, expect } from 'vitest';
import { isWaitingStatus, hasPendingSignature } from '../bon-helpers';

describe('isWaitingStatus', () => {
  it('is true for statuses awaiting a collaborator signature', () => {
    expect(isWaitingStatus('sent_mise_dispo')).toBe(true);
    expect(isWaitingStatus('sent_restitution')).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isWaitingStatus('active')).toBe(false);
    expect(isWaitingStatus('archived')).toBe(false);
    expect(isWaitingStatus('draft')).toBe(false);
  });
});

describe('hasPendingSignature', () => {
  it('only applies to partially_returned bons', () => {
    expect(hasPendingSignature({ status: 'active', signatures: [{ type: 'restitution', signed: false }] })).toBe(false);
  });

  it('is true when a restitution/pv signature is still unsigned', () => {
    expect(
      hasPendingSignature({ status: 'partially_returned', signatures: [{ type: 'restitution', signed: false }] }),
    ).toBe(true);
    expect(
      hasPendingSignature({ status: 'partially_returned', signatures: [{ type: 'pv_cloture', signed: false }] }),
    ).toBe(true);
  });

  it('is false when the relevant signatures are signed', () => {
    expect(
      hasPendingSignature({ status: 'partially_returned', signatures: [{ type: 'restitution', signed: true }] }),
    ).toBe(false);
  });

  it('is false with no signatures', () => {
    expect(hasPendingSignature({ status: 'partially_returned' })).toBe(false);
  });
});
