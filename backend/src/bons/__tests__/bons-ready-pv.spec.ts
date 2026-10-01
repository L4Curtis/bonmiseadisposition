import { describe, expect, it } from 'vitest';
import { findPvItSignature, type ReadyPvCandidate } from '../bons-ready-pv';

function sig(overrides: Partial<ReadyPvCandidate> & { id: string }): ReadyPvCandidate {
  return {
    type: 'it_cachet', signed: true, pdfType: 'pv_cloture', signedAt: new Date('2026-09-20T10:00:00Z'), invalidatedAt: null,
    ...overrides,
  };
}

describe('findPvItSignature — signature IT qui certifie le PV prêt', () => {
  it('la plus récente signature IT valable du PV', () => {
    const found = findPvItSignature([
      sig({ id: 'ancienne', signedAt: new Date('2026-09-19T10:00:00Z') }),
      sig({ id: 'recente', signedAt: new Date('2026-09-21T10:00:00Z') }),
      sig({ id: 'remise', pdfType: 'mise_disposition', signedAt: new Date('2026-09-22T10:00:00Z') }),
    ]);
    expect(found?.id).toBe('recente');
  });

  it('ignore une signature IT du PV retirée depuis, et les signatures du collaborateur', () => {
    expect(findPvItSignature([
      sig({ id: 'retiree', invalidatedAt: new Date('2026-09-21T10:00:00Z') }),
      sig({ id: 'collab', type: 'pv_cloture', pdfType: null }),
    ])).toBeNull();
  });
});
