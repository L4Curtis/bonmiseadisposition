import { describe, expect, it } from 'vitest';
import type { PdfSnapshotInfo, SafeSignature } from '@/contracts/bons';
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

function snapshot(extra: Partial<PdfSnapshotInfo> & Pick<PdfSnapshotInfo, 'id' | 'type' | 'createdAt'>): PdfSnapshotInfo {
  return {
    filename: `${extra.id}.pdf`, sha256: null, signatureType: null, sequence: 1, sequenceCount: 1, latest: true,
    supersededAt: null, supersededReason: null, ...extra,
  };
}

describe('documents du collaborateur (R-092)', () => {
  it('une entrée par document final, nommée ; jamais les versions signées par l’IT seule', () => {
    const docs = collaboratorDocuments([
      snapshot({ id: 'a', type: 'signature_it_mise_disposition', createdAt: '2026-07-16T10:00:00Z', signatureType: 'it_cachet' }),
      snapshot({ id: 'b', type: 'signature_collab_mise_disposition', createdAt: '2026-07-17T10:00:00Z', signatureType: 'mise_disposition' }),
      snapshot({ id: 'c', type: 'signature_it_restitution', createdAt: '2026-09-01T10:00:00Z', signatureType: 'it_cachet' }),
      snapshot({ id: 'd', type: 'signature_collab_restitution', createdAt: '2026-09-02T10:00:00Z', signatureType: 'restitution' }),
      snapshot({ id: 'pv-it', type: 'cloture_equipements_manquants', createdAt: '2026-09-03T08:00:00Z', signatureType: 'it_cachet', sequenceCount: 2, latest: false }),
      snapshot({ id: 'pv', type: 'cloture_equipements_manquants', createdAt: '2026-09-03T10:00:00Z', signatureType: 'pv_cloture', sequence: 2, sequenceCount: 2 }),
    ]);
    expect(docs.map((d) => [d.id, d.label])).toEqual([
      ['b', 'Bon de mise à disposition signé'],
      ['d', 'Bon de restitution signé'],
      ['pv', 'PV de non-restitution'],
    ]);
  });

  it('deux restitutions : deux documents, chacun avec sa date et son rang (plus d’écrasement)', () => {
    const docs = collaboratorDocuments([
      snapshot({ id: 'r1', type: 'signature_collab_restitution', createdAt: '2026-09-27T13:03:00Z', signatureType: 'restitution', sequenceCount: 2, latest: false }),
      snapshot({ id: 'r2', type: 'signature_collab_restitution', createdAt: '2026-09-27T13:04:00Z', signatureType: 'restitution', sequence: 2, sequenceCount: 2 }),
    ]);
    expect(docs.map((d) => [d.id, d.label, d.createdAt])).toEqual([
      ['r1', 'Bon de restitution signé (1 sur 2)', '2026-09-27T13:03:00Z'],
      ['r2', 'Bon de restitution signé (2 sur 2)', '2026-09-27T13:04:00Z'],
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
