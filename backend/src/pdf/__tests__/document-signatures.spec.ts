import { selectDocumentSignatures, PdfSignature } from '../document-signatures';

/**
 * Chaque PDF montre les signatures DE SON document (R-030) : la case IT porte
 * la signature IT de ce document, la case collaborateur la signature de ce
 * document, jamais celle d'une autre étape du bon.
 */

const at = (iso: string) => new Date(iso);

function sig(overrides: Partial<PdfSignature> & Pick<PdfSignature, 'type'>): PdfSignature {
  return {
    signed: true,
    signedAt: null,
    signatureImagePath: `${overrides.type}.enc`,
    signerEmail: null,
    pdfType: null,
    createdAt: overrides.signedAt ?? null,
    tokenExpiresAt: at('2027-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Bon remis le J par le technicien A, repris le J+3 par le technicien B. */
function fullCycle(): PdfSignature[] {
  return [
    sig({ type: 'it_cachet', pdfType: 'mise_disposition', signedAt: at('2026-09-01T08:00:00Z'), signerEmail: 'a@livio.fr' }),
    sig({ type: 'mise_disposition', signedAt: at('2026-09-01T09:00:00Z'), signerEmail: 'lea@livio.fr' }),
    sig({ type: 'it_cachet', pdfType: 'restitution', signedAt: at('2026-09-04T08:00:00Z'), signerEmail: 'b@livio.fr' }),
    sig({ type: 'restitution', signedAt: at('2026-09-04T09:00:00Z'), signerEmail: 'lea@livio.fr' }),
  ];
}

describe('selectDocumentSignatures', () => {
  it('PDF de remise : signature IT de la remise (technicien A) et signature de remise du collaborateur', () => {
    const { it: itSig, collab } = selectDocumentSignatures(fullCycle(), 'mise_disposition');
    expect(itSig?.signerEmail).toBe('a@livio.fr');
    expect(collab?.type).toBe('mise_disposition');
    expect(collab?.signedAt).toEqual(at('2026-09-01T09:00:00Z'));
  });

  it('PDF de restitution : technicien B et date de la restitution, jamais celles de la remise', () => {
    const { it: itSig, collab } = selectDocumentSignatures(fullCycle(), 'restitution');
    expect(itSig?.signerEmail).toBe('b@livio.fr');
    expect(collab?.type).toBe('restitution');
    expect(collab?.signedAt).toEqual(at('2026-09-04T09:00:00Z'));
  });

  it('PV : sa propre signature IT et sa propre signature collaborateur', () => {
    const signatures = [
      ...fullCycle().slice(0, 2),
      sig({ type: 'it_cachet', pdfType: 'pv_cloture', signedAt: at('2026-09-10T08:00:00Z'), signerEmail: 'c@livio.fr' }),
      sig({ type: 'pv_cloture', signedAt: at('2026-09-11T10:00:00Z'), signerEmail: 'lea@livio.fr' }),
    ];
    const { it: itSig, collab } = selectDocumentSignatures(signatures, 'cloture');
    expect(itSig?.signerEmail).toBe('c@livio.fr');
    expect(collab?.type).toBe('pv_cloture');
  });

  it('PV encore à signer : case collaborateur vide, même si la remise est signée', () => {
    const signatures = [
      ...fullCycle().slice(0, 2),
      sig({ type: 'it_cachet', pdfType: 'pv_cloture', signedAt: at('2026-09-10T08:00:00Z'), signerEmail: 'c@livio.fr' }),
      sig({ type: 'pv_cloture', signed: false, signedAt: null, createdAt: at('2026-09-10T08:00:01Z') }),
    ];
    expect(selectDocumentSignatures(signatures, 'cloture').collab).toBeNull();
  });

  it('nouvelle restitution en attente : la signature de la restitution précédente ne remplit pas la case', () => {
    const signatures = [
      ...fullCycle(),
      sig({ type: 'it_cachet', pdfType: 'restitution', signedAt: at('2026-09-20T08:00:00Z'), signerEmail: 'd@livio.fr' }),
      sig({ type: 'restitution', signed: false, signedAt: null, createdAt: at('2026-09-20T08:00:05Z') }),
    ];
    const { it: itSig, collab } = selectDocumentSignatures(signatures, 'restitution');
    expect(collab).toBeNull();
    expect(itSig?.signerEmail).toBe('d@livio.fr');
  });

  it('un lien invalidé plus récent ne vide pas la case (il ne sera jamais signé)', () => {
    const signatures = [
      ...fullCycle(),
      sig({ type: 'restitution', signed: false, signedAt: null, createdAt: at('2026-09-20T08:00:05Z'), tokenExpiresAt: new Date(0) }),
    ];
    expect(selectDocumentSignatures(signatures, 'restitution').collab?.signedAt).toEqual(at('2026-09-04T09:00:00Z'));
  });

  it('la signature IT retenue précède la signature du collaborateur qu’elle accompagne', () => {
    const signatures = [
      ...fullCycle(),
      // Signature IT d'une restitution suivante, pas encore demandée au collaborateur.
      sig({ type: 'it_cachet', pdfType: 'restitution', signedAt: at('2026-09-20T08:00:00Z'), signerEmail: 'd@livio.fr' }),
    ];
    expect(selectDocumentSignatures(signatures, 'restitution').it?.signerEmail).toBe('b@livio.fr');
  });

  it('mode « none » (document de l’IT seule) : jamais de signature du collaborateur', () => {
    const { it: itSig, collab } = selectDocumentSignatures(fullCycle(), 'mise_disposition', 'none');
    expect(collab).toBeNull();
    expect(itSig?.signerEmail).toBe('a@livio.fr');
  });

  it('avenant : la signature IT de l’avenant, sans case collaborateur', () => {
    const signatures = [
      ...fullCycle(),
      sig({ type: 'it_cachet', pdfType: 'avenant', signedAt: at('2026-10-01T08:00:00Z'), signerEmail: 'e@livio.fr' }),
    ];
    const selection = selectDocumentSignatures(signatures, 'avenant');
    expect(selection.it?.signerEmail).toBe('e@livio.fr');
    expect(selection.collab).toBeNull();
  });

  it('aucune signature IT de ce document : case IT vide plutôt que celle d’une autre étape', () => {
    const signatures = fullCycle().filter((s) => s.pdfType !== 'restitution');
    expect(selectDocumentSignatures(signatures, 'restitution').it).toBeNull();
  });

  it('signature non encore signée ou sans date : ignorée', () => {
    const signatures = [sig({ type: 'mise_disposition', signed: false, signedAt: null })];
    expect(selectDocumentSignatures(signatures, 'mise_disposition').collab).toBeNull();
  });

  describe('signatures IT antérieures à pdfType (sans type de document)', () => {
    const legacy = (): PdfSignature[] => [
      sig({ type: 'it_cachet', signedAt: at('2026-01-03T08:00:00Z'), signerEmail: 'a@livio.fr' }),
      sig({ type: 'mise_disposition', signedAt: at('2026-01-03T09:00:00Z') }),
      sig({ type: 'it_cachet', signedAt: at('2026-02-01T08:00:00Z'), signerEmail: 'b@livio.fr' }),
      sig({ type: 'restitution', signedAt: at('2026-02-01T09:00:00Z') }),
    ];

    it('remise : la signature IT d’avant la remise', () => {
      expect(selectDocumentSignatures(legacy(), 'mise_disposition').it?.signerEmail).toBe('a@livio.fr');
    });

    it('restitution : jamais la signature IT de la remise (constat BON-2026-D0041)', () => {
      expect(selectDocumentSignatures(legacy(), 'restitution').it?.signerEmail).toBe('b@livio.fr');
    });
  });
});

describe('selectDocumentSignatures — déclaration pendant une restitution à signer', () => {
  it('la signature IT de la déclaration signe le PV, pas la restitution en attente', () => {
    const signatures: PdfSignature[] = [
      ...fullCycle().slice(0, 3),
      // Déclaration de non-restitution par C, restitution encore à signer.
      sig({ type: 'it_cachet', pdfType: 'pv_cloture', signedAt: at('2026-09-04T08:30:00Z'), signerEmail: 'c@livio.fr' }),
      sig({ type: 'restitution', signedAt: at('2026-09-04T09:00:00Z'), signerEmail: 'lea@livio.fr' }),
      sig({ type: 'pv_cloture', signedAt: at('2026-09-05T09:00:00Z'), signerEmail: 'lea@livio.fr' }),
    ];
    expect(selectDocumentSignatures(signatures, 'restitution').it?.signerEmail).toBe('b@livio.fr');
    expect(selectDocumentSignatures(signatures, 'cloture').it?.signerEmail).toBe('c@livio.fr');
  });
});

describe('selectDocumentSignatures — signature IT invalidée', () => {
  it('une signature IT invalidée (bon modifié) ne remplit plus la case IT', () => {
    const signatures: PdfSignature[] = [
      { type: 'it_cachet', pdfType: 'mise_disposition', signed: true, signedAt: new Date('2026-09-01T08:00:00Z'), signerEmail: 'a@livio.fr', invalidatedAt: new Date('2026-09-01T10:00:00Z') },
      { type: 'it_cachet', pdfType: 'mise_disposition', signed: true, signedAt: new Date('2026-09-01T11:00:00Z'), signerEmail: 'b@livio.fr' },
    ];
    expect(selectDocumentSignatures(signatures, 'mise_disposition').it?.signerEmail).toBe('b@livio.fr');
    expect(selectDocumentSignatures(signatures.slice(0, 1), 'mise_disposition').it).toBeNull();
  });
});
