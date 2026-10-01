import { attachmentFilename, documentFilename, fileTimestamp } from '../snapshot-filename';
import { toDocumentList, DocumentRow } from '../snapshot-list';
import { proofSignatureId } from '../snapshot-store';

/**
 * Documents probants : noms lisibles et datés, liste complète (un document
 * par signature, rang parmi ceux du même type, version remplacée signalée),
 * rattachement du document à la signature dont il est la preuve.
 */

describe('noms des documents', () => {
  const bon = { reference: 'BON-2026-0074', collaborateur: { displayName: 'Léa Martin' } };

  it('dit quel document c’est, à l’heure de Paris, à la seconde', () => {
    // 13 h 03 min 27 s UTC = 15 h 03 à Paris (heure d’été).
    const at = new Date('2026-09-27T13:03:27Z');
    expect(documentFilename(bon, 'signature_collab_restitution', at))
      .toBe('BON-2026-0074_Lea-Martin_Bon-de-restitution-signe_2026-09-27_15h03m27.pdf');
    expect(documentFilename(bon, 'cloture_equipements_manquants', at))
      .toBe('BON-2026-0074_Lea-Martin_PV-de-non-restitution-signe_2026-09-27_15h03m27.pdf');
  });

  it('PV : la version signée par l’IT seule a son propre nom, comme la remise et la restitution', () => {
    const at = new Date('2026-09-27T13:03:27Z');
    expect(documentFilename(bon, 'cloture_equipements_manquants', at, { itVersion: true }))
      .toBe('BON-2026-0074_Lea-Martin_PV-de-non-restitution_signature-IT_2026-09-27_15h03m27.pdf');
    expect(documentFilename(bon, 'signature_it_restitution', at))
      .toBe('BON-2026-0074_Lea-Martin_Bon-de-restitution_signature-IT_2026-09-27_15h03m27.pdf');
  });

  it('deux documents du même type à une seconde d’écart ne portent pas le même nom', () => {
    const first = documentFilename(bon, 'signature_collab_restitution', new Date('2026-09-27T13:03:27Z'));
    const second = documentFilename(bon, 'signature_collab_restitution', new Date('2026-09-27T13:03:28Z'));
    expect(first).not.toBe(second);
  });

  it('pièce jointe : jamais le nom technique du type', () => {
    const name = attachmentFilename('BON-2026-0074', 'signature_collab_mise_disposition', new Date('2026-09-27T22:30:00Z'));
    expect(name).toBe('BON-2026-0074_Bon-de-mise-a-disposition-signe_2026-09-28_00h30.pdf');
    expect(name).not.toMatch(/signature_collab|cloture_equipements/);
  });

  it('pièce jointe : deux restitutions signées le même jour ne portent pas le même nom', () => {
    const first = attachmentFilename('BON-2026-0076', 'signature_collab_restitution', new Date('2026-09-28T09:08:00Z'));
    const second = attachmentFilename('BON-2026-0076', 'signature_collab_restitution', new Date('2026-09-28T09:10:00Z'));
    expect(first).toBe('BON-2026-0076_Bon-de-restitution-signe_2026-09-28_11h08.pdf');
    expect(second).not.toBe(first);
  });

  it('horodatage : minuit à Paris reste le bon jour', () => {
    expect(fileTimestamp(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01_00h30m00');
  });
});

describe('liste des documents', () => {
  const row = (id: string, type: DocumentRow['type'], at: string, signature: DocumentRow['signature'] = null): DocumentRow => ({
    id, type, filename: `${id}.pdf`, createdAt: new Date(at), sha256: `sha-${id}`, signature,
  });

  it('tous les documents, avec leur rang et la version en vigueur de chaque type', () => {
    const list = toDocumentList([
      row('a', 'signature_collab_mise_disposition', '2026-09-27T12:50:00Z', { type: 'mise_disposition', invalidatedAt: null, invalidatedReason: null }),
      row('b', 'signature_collab_restitution', '2026-09-27T13:03:00Z', { type: 'restitution', invalidatedAt: null, invalidatedReason: null }),
      row('c', 'signature_collab_restitution', '2026-09-27T13:04:00Z', { type: 'restitution', invalidatedAt: null, invalidatedReason: null }),
    ]);
    expect(list.map((d) => [d.id, d.sequence, d.sequenceCount, d.latest])).toEqual([
      ['a', 1, 1, true],
      ['b', 1, 2, false],
      ['c', 2, 2, true],
    ]);
    expect(list[1].createdAt).toBe('2026-09-27T13:03:00.000Z');
  });

  it('PV : la version signée par l’IT et celle signée par le collaborateur ont chacune leur série', () => {
    const list = toDocumentList([
      row('pv-it', 'cloture_equipements_manquants', '2026-09-27T13:00:00Z', { type: 'it_cachet', invalidatedAt: null, invalidatedReason: null }),
      row('pv', 'cloture_equipements_manquants', '2026-09-27T13:10:00Z', { type: 'pv_cloture', invalidatedAt: null, invalidatedReason: null }),
    ]);
    expect(list.map((d) => [d.id, d.sequence, d.sequenceCount, d.latest])).toEqual([
      ['pv-it', 1, 1, true],
      ['pv', 1, 1, true],
    ]);
  });

  it('document d’une signature IT invalidée (bon modifié) : remplacé, avec le motif', () => {
    const [doc] = toDocumentList([
      row('it', 'signature_it_mise_disposition', '2026-09-27T12:39:00Z', {
        type: 'it_cachet', invalidatedAt: new Date('2026-09-27T12:45:00Z'), invalidatedReason: 'modified',
      }),
    ]);
    expect(doc).toMatchObject({ signatureType: 'it_cachet', supersededAt: '2026-09-27T12:45:00.000Z', supersededReason: 'modified' });
  });

  it('geste sans signature : aucune signature rattachée, jamais « remplacé »', () => {
    const [doc] = toDocumentList([row('s', 'remise_sans_signature', '2026-09-27T12:00:00Z')]);
    expect(doc).toMatchObject({ signatureType: null, supersededAt: null, supersededReason: null });
  });
});

describe('signature dont le document est la preuve', () => {
  const it_ = { id: 'sig-it', type: 'it_cachet', signed: true };
  const collab = { id: 'sig-collab', type: 'restitution', signed: true };

  it('document signé par le collaborateur : sa signature', () => {
    expect(proofSignatureId({ documentType: 'restitution', collab: 'document' }, { it: it_, collab })).toBe('sig-collab');
  });

  it('version de l’IT seule (PV émis, signature IT) : la signature IT', () => {
    expect(proofSignatureId({ documentType: 'cloture', collab: 'document' }, { it: it_, collab: null })).toBe('sig-it');
    expect(proofSignatureId({ documentType: 'restitution', collab: 'none' }, { it: it_, collab })).toBe('sig-it');
  });

  it('geste sans signature : aucune', () => {
    const notice = { kind: 'handover' as const, reason: 'r', actorName: 'a', at: new Date() };
    expect(proofSignatureId({ documentType: 'mise_disposition', collab: 'none', notice }, { it: it_, collab: null })).toBeNull();
  });
});
