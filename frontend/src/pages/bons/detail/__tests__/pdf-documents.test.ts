import { describe, expect, it } from 'vitest';
import type { PdfSnapshotInfo } from '@/contracts/bons';
import { documentLines } from '../pdf-documents';

function snapshot(extra: Partial<PdfSnapshotInfo> & Pick<PdfSnapshotInfo, 'id' | 'type'>): PdfSnapshotInfo {
  return {
    filename: `${extra.id}.pdf`, createdAt: '2026-09-27T12:00:00Z', sha256: 'abc', signatureType: null,
    sequence: 1, sequenceCount: 1, latest: true, supersededAt: null, supersededReason: null, ...extra,
  };
}

describe('liste des documents de la fiche IT', () => {
  it('chaque document signé est listé, dans l’ordre, avec son rang quand un type revient', () => {
    const lines = documentLines([
      snapshot({ id: 'r1', type: 'signature_collab_restitution', signatureType: 'restitution', sequenceCount: 2, latest: false }),
      snapshot({ id: 'r2', type: 'signature_collab_restitution', signatureType: 'restitution', sequence: 2, sequenceCount: 2 }),
    ]);
    expect(lines.map((l) => [l.id, l.title, l.status])).toEqual([
      ['r1', 'Signature du collaborateur — restitution (1 sur 2)', null],
      ['r2', 'Signature du collaborateur — restitution (2 sur 2)', 'En vigueur'],
    ]);
  });

  it('signature IT remplacée après une modification : « Ne vaut plus », avec le motif', () => {
    const [line] = documentLines([
      snapshot({ id: 'it', type: 'signature_it_mise_disposition', signatureType: 'it_cachet', supersededAt: '2026-09-27T12:45:00Z', supersededReason: 'modified', sequenceCount: 2, latest: false }),
    ]);
    expect(line.status).toBe('Ne vaut plus — Bon modifié');
    expect(line.superseded).toBe(true);
  });

  it('PV : la version signée par l’IT seule est distinguée du PV signé par le collaborateur', () => {
    const lines = documentLines([
      snapshot({ id: 'pv-it', type: 'cloture_equipements_manquants', signatureType: 'it_cachet', sequenceCount: 2, latest: false }),
      snapshot({ id: 'pv', type: 'cloture_equipements_manquants', signatureType: 'pv_cloture', sequence: 2, sequenceCount: 2 }),
    ]);
    expect(lines.map((l) => l.title)).toEqual([
      'PV de non-restitution — signé par l’IT (1 sur 2)',
      'PV de non-restitution — signé par le collaborateur (2 sur 2)',
    ]);
  });
});
