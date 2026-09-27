import { buildSignaturesModel, SignaturesModelInput } from '../../render/signature-model';
import { buildCertificateEntries } from '../../render/certificate';
import { DEFAULT_CONFIGS } from '../../pdf-template-defaults';
import type { BonForPdf, PdfSignature } from '../../pdf-types';

const itRestitution: PdfSignature = {
  type: 'it_cachet',
  pdfType: 'restitution',
  signed: true,
  signedAt: new Date('2026-09-04T08:00:00Z'),
  signerEmail: 'theo.b@livio.fr',
  signerIp: '10.0.0.5',
  mentionLuApprouve: true,
  isInPerson: true,
  signedByProxy: false,
};

const collabRestitution: PdfSignature = {
  type: 'restitution',
  signed: true,
  signedAt: new Date('2026-09-04T22:30:00Z'), // 5 septembre, 0 h 30 à Paris
  signerEmail: 'lea.martin@livio.fr',
  signerIp: '10.0.0.42',
  mentionLuApprouve: true,
  isInPerson: false,
  signedByProxy: false,
};

const bon: BonForPdf = {
  id: 'bon-1',
  reference: 'BON-2026-0042',
  civilite: 'mme',
  status: 'archived',
  dateMiseDisposition: new Date('2026-09-01T00:00:00Z'),
  filiale: { displayName: 'Livio Nord' },
  collaborateur: { displayName: 'Léa Martin' },
  collaborateurEmail: 'lea.martin@livio.fr',
  createdBy: { displayName: 'Alice Créatrice' },
  equipments: [],
  signatures: [itRestitution, collabRestitution],
};

const names = new Map([
  ['theo.b@livio.fr', 'Théo Bernard'],
  ['julie.moreau@livio.fr', 'Julie Moreau'],
  ['lea.martin@livio.fr', 'Léa Martin'],
]);

function input(overrides: Partial<SignaturesModelInput> = {}): SignaturesModelInput {
  return {
    bon,
    documentType: 'restitution',
    selection: { it: itRestitution, collab: collabRestitution },
    images: { it: 'data:image/png;base64,SVQ=', collab: 'data:image/png;base64,Q09MTEFC' },
    names,
    config: DEFAULT_CONFIGS.restitution,
    civiliteLabel: 'Mme',
    ...overrides,
  };
}

describe('buildSignaturesModel — cases de signature d’un document', () => {
  it('case IT : le technicien qui a signé ce document, pas le créateur du bon', () => {
    const model = buildSignaturesModel(input());
    expect(model.it.name).toBe('Théo Bernard');
    expect(model.it.name).not.toContain('Alice');
    expect(model.it.date).toBe('04/09/2026');
    expect(model.it.signatureImage).toBe('data:image/png;base64,SVQ=');
  });

  it('case collaborateur : la date de ce document, à l’heure de Paris', () => {
    const model = buildSignaturesModel(input());
    expect(model.collab?.name).toBe('Mme Léa Martin');
    expect(model.collab?.date).toBe('05/09/2026');
    expect(model.collab?.detail).toBeUndefined();
  });

  it('aucune signature IT pour ce document : case IT sans nom ni image', () => {
    const model = buildSignaturesModel(input({ selection: { it: null, collab: collabRestitution }, images: { it: null, collab: null } }));
    expect(model.it.name).toBe('—');
    expect(model.it.signatureImage).toBeNull();
  });

  it('signature au guichet recueillie par un technicien : au nom du collaborateur, en présence du technicien', () => {
    const proxy: PdfSignature = { ...collabRestitution, isInPerson: true, signedByProxy: true, signerEmail: 'julie.moreau@livio.fr' };
    const model = buildSignaturesModel(input({ selection: { it: itRestitution, collab: proxy } }));
    expect(model.collab?.name).toBe('Mme Léa Martin');
    expect(model.collab?.detail).toBe('au guichet, en présence de Julie Moreau');
  });

  it('remise constatée sans signature : ni image ni date de signature, le motif et le technicien à la place', () => {
    const model = buildSignaturesModel(input({
      documentType: 'mise_disposition',
      config: DEFAULT_CONFIGS.mise_disposition,
      selection: { it: itRestitution, collab: null },
      notice: { kind: 'handover', reason: 'Collaborateur en chantier', actorName: 'Théo Bernard', at: new Date('2026-09-02T10:00:00Z') },
    }));
    expect(model.collab?.signatureImage).toBeNull();
    expect(model.collab?.mention).toBe('Remise constatée sans la signature du collaborateur');
    expect(model.collab?.placeholder).toBe('Motif : Collaborateur en chantier\nConstaté par Théo Bernard le 02/09/2026');
  });

  it('bon clôturé sans signature : mention de clôture, jamais « Lu et approuvé »', () => {
    const model = buildSignaturesModel(input({
      selection: { it: itRestitution, collab: null },
      notice: { kind: 'closure', reason: 'Départ', actorName: 'Théo Bernard', at: new Date('2026-09-02T10:00:00Z') },
    }));
    expect(model.collab?.mention).toBe('Clôture constatée sans la signature du collaborateur');
    expect(model.collab?.mention).not.toContain('Lu et approuvé');
  });

  it('avenant : une seule case, la signature IT', () => {
    const model = buildSignaturesModel(input({ documentType: 'avenant', config: DEFAULT_CONFIGS.avenant }));
    expect(model.collab).toBeNull();
  });
});

describe('buildCertificateEntries — certificat du document', () => {
  it('ne liste que les signatures du document, dans l’ordre chronologique', () => {
    const entries = buildCertificateEntries(bon, { it: itRestitution, collab: collabRestitution }, names);
    expect(entries.map((e) => e.role)).toEqual([
      'Équipe informatique — signature IT — restitution',
      'Collaborateur — restitution',
    ]);
  });

  it('signature IT : jamais « cachet », jamais « au guichet », le nom du technicien', () => {
    const [itEntry] = buildCertificateEntries(bon, { it: itRestitution, collab: null }, names);
    expect(itEntry.role).not.toMatch(/cachet/i);
    expect(itEntry.badge).toBeNull();
    expect(itEntry.meta).toContainEqual(['Signataire', 'Théo Bernard']);
    expect(itEntry.meta).toContainEqual(['Compte', 'theo.b@livio.fr']);
    expect(itEntry.luApprouve).toBe(false);
  });

  it('signature au guichet par mandataire : signataire = collaborateur, technicien présent nommé', () => {
    const proxy: PdfSignature = { ...collabRestitution, isInPerson: true, signedByProxy: true, signerEmail: 'julie.moreau@livio.fr' };
    const [entry] = buildCertificateEntries(bon, { it: null, collab: proxy }, names);
    expect(entry.badge).toBe('Signature au guichet');
    expect(entry.meta).toContainEqual(['Signataire', 'Léa Martin']);
    expect(entry.meta).toContainEqual(['En présence de', 'Julie Moreau']);
    expect(entry.meta).toContainEqual(['Compte utilisé', 'julie.moreau@livio.fr']);
  });

  it('PV : libellé « PV de non-restitution »', () => {
    const pv: PdfSignature = { ...collabRestitution, type: 'pv_cloture' };
    const pvIt: PdfSignature = { ...itRestitution, pdfType: 'pv_cloture' };
    const entries = buildCertificateEntries(bon, { it: pvIt, collab: pv }, names);
    expect(entries.map((e) => e.role)).toEqual([
      'Équipe informatique — signature IT — PV de non-restitution',
      'Collaborateur — PV de non-restitution',
    ]);
  });
});
