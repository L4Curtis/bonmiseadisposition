import { describe, expect, it } from 'vitest';
import type { SafeSignature } from '@/contracts/bons';
import { collaboratorDocuments, collaboratorSignatures } from '../collaborator-view';

function signature(extra: Partial<SafeSignature>): SafeSignature {
  return {
    id: 's',
    type: 'mise_disposition',
    signed: true,
    signedAt: '2026-07-17T10:00:00Z',
    signerEmail: 'lea@example.test',
    mentionLuApprouve: true,
    isInPerson: false,
    tokenExpiresAt: '2026-07-24T10:00:00Z',
    createdAt: '2026-07-16T10:00:00Z',
    pdfType: null,
    ...extra,
  };
}

describe('documents du collaborateur (R-092)', () => {
  it('une entrée par document final, nommée ; jamais les versions signées par l’IT seule', () => {
    const docs = collaboratorDocuments([
      { type: 'signature_it_mise_disposition', filename: 'a.pdf', createdAt: '2026-07-16', sha256: null },
      { type: 'signature_collab_mise_disposition', filename: 'b.pdf', createdAt: '2026-07-17', sha256: null },
      { type: 'signature_it_restitution', filename: 'c.pdf', createdAt: '2026-09-01', sha256: null },
      { type: 'signature_collab_restitution', filename: 'd.pdf', createdAt: '2026-09-02', sha256: null },
      { type: 'cloture_equipements_manquants', filename: 'e.pdf', createdAt: '2026-09-03', sha256: null },
    ]);
    expect(docs.map((d) => d.label)).toEqual([
      'Bon de mise à disposition signé',
      'Bon de restitution signé',
      'PV de non-restitution',
    ]);
  });
});

describe('signatures du collaborateur (R-032)', () => {
  it('dans l’ordre chronologique, sans la signature IT, « au guichet » seulement sur place', () => {
    const list = collaboratorSignatures([
      signature({ id: 'pv', type: 'pv_cloture', signedAt: '2026-09-20T10:00:00Z', isInPerson: true }),
      signature({ id: 'it', type: 'it_cachet', signedAt: '2026-07-16T09:00:00Z' }),
      signature({ id: 'remise', signedAt: '2026-07-17T10:00:00Z' }),
      signature({ id: 'restit', type: 'restitution', signedAt: '2026-09-02T10:00:00Z' }),
      signature({ id: 'attente', type: 'restitution', signed: false, signedAt: null }),
    ]);
    expect(list.map((s) => s.id)).toEqual(['remise', 'restit', 'pv']);
    expect(list.map((s) => s.atCounter)).toEqual([false, false, true]);
    expect(list[2].label).toBe('PV de non-restitution');
  });
});
