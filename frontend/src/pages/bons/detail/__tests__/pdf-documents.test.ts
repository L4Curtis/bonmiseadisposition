import { describe, expect, it } from 'vitest';
import type { PdfSnapshotInfo, SafeSignature } from '@/contracts/bons';
import { documentLines, readyPvOf } from '../pdf-documents';

function snapshot(extra: Partial<PdfSnapshotInfo> & Pick<PdfSnapshotInfo, 'id' | 'type'>): PdfSnapshotInfo {
  return {
    filename: `${extra.id}.pdf`, createdAt: '2026-09-27T12:00:00Z', sha256: 'abc', signatureType: null,
    sequence: 1, sequenceCount: 1, latest: true, supersededAt: null, supersededReason: null, ...extra,
  };
}

describe('liste des documents de la fiche IT', () => {
  it('chaque document signé est listé, dans l’ordre, avec son rang quand sa série revient', () => {
    const lines = documentLines([
      snapshot({ id: 'r1', type: 'signature_collab_restitution', signatureType: 'restitution', sequenceCount: 2, latest: false }),
      snapshot({ id: 'r2', type: 'signature_collab_restitution', signatureType: 'restitution', sequence: 2, sequenceCount: 2 }),
    ]);
    expect(lines.map((l) => [l.id, l.title, l.status])).toEqual([
      ['r1', 'Restitution — signée par le collaborateur (1 sur 2)', 'En vigueur'],
      ['r2', 'Restitution — signée par le collaborateur (2 sur 2)', 'En vigueur'],
    ]);
  });

  it('un seul badge, la même règle partout : un document seul de sa série est aussi « En vigueur »', () => {
    const [line] = documentLines([
      snapshot({ id: 'r', type: 'signature_collab_restitution', signatureType: 'restitution' }),
    ]);
    expect(line.status).toBe('En vigueur');
    expect(line.superseded).toBe(false);
  });

  it('signature IT remplacée après une modification : « Ne vaut plus », avec le motif', () => {
    const [line] = documentLines([
      snapshot({ id: 'it', type: 'signature_it_mise_disposition', signatureType: 'it_cachet', supersededAt: '2026-09-27T12:45:00Z', supersededReason: 'modified', sequenceCount: 2, latest: false }),
    ]);
    expect(line.title).toBe('Remise — signature IT (1 sur 2)');
    expect(line.status).toBe('Ne vaut plus — Bon modifié');
    expect(line.superseded).toBe(true);
  });

  it('vocabulaire : « remise », « signature IT », « PV de non-restitution » ; jamais « mise à disposition » ni « cachet »', () => {
    const lines = documentLines([
      snapshot({ id: 'a', type: 'signature_it_mise_disposition', signatureType: 'it_cachet' }),
      snapshot({ id: 'b', type: 'signature_collab_mise_disposition', signatureType: 'mise_disposition' }),
      snapshot({ id: 'c', type: 'signature_it_restitution', signatureType: 'it_cachet' }),
    ]);
    expect(lines.map((l) => l.title)).toEqual([
      'Remise — signature IT',
      'Remise — signée par le collaborateur',
      'Restitution — signature IT',
    ]);
    expect(lines.map((l) => l.title).join(' ')).not.toMatch(/mise à disposition|cachet/i);
  });

  it('PV : chaque signataire a sa série, sans rang commun', () => {
    const lines = documentLines([
      snapshot({ id: 'pv-it', type: 'cloture_equipements_manquants', signatureType: 'it_cachet' }),
      snapshot({ id: 'pv', type: 'cloture_equipements_manquants', signatureType: 'pv_cloture' }),
    ]);
    expect(lines.map((l) => l.title)).toEqual([
      'PV de non-restitution — signature IT',
      'PV de non-restitution — signé par le collaborateur',
    ]);
  });
});

describe('PV prêt (perte déclarée, équipements encore dehors)', () => {
  const itPv = (extra: Partial<SafeSignature> = {}): SafeSignature => ({
    id: 'pv-it', type: 'it_cachet', signed: true, signedAt: '2026-06-19T21:53:00.000Z', signerEmail: 'julie@livio.fr',
    signerName: 'Julie Moreau', mentionLuApprouve: false, isInPerson: false, tokenExpiresAt: '2026-06-19T21:53:00.000Z',
    createdAt: '2026-06-19T21:53:00.000Z', pdfType: 'pv_cloture', invalidatedAt: null, invalidatedReason: null, ...extra,
  });

  it('perte déclarée et signature IT du PV : le PV prêt est proposé, avec son signataire', () => {
    expect(readyPvOf({ subStatus: 'loss_declared', signatures: [itPv()] })).toEqual({
      signedAt: '2026-06-19T21:53:00.000Z', signerName: 'Julie Moreau',
    });
  });

  it('PV déjà parti (à signer) ou signature IT retirée : rien de plus que la liste', () => {
    expect(readyPvOf({ subStatus: 'pv_to_sign', signatures: [itPv()] })).toBeNull();
    expect(readyPvOf({ subStatus: 'loss_declared', signatures: [itPv({ invalidatedAt: '2026-06-20T00:00:00.000Z' })] })).toBeNull();
  });
});
