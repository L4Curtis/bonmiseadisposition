import PDFDocument = require('pdfkit');
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import type { Mock, MockInstance } from 'vitest';
import { PdfService } from '../pdf.service';
import { PdfTemplatesService } from '../pdf-templates.service';
import { DEFAULT_CONFIGS } from '../pdf-template-defaults';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../config/encryption.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';
import { loadDocumentSignatureImages } from '../signature-images';
import type { BonForPdf, PdfSignature } from '../pdf-types';

/**
 * Ce que le PDF affirme, lu dans les textes réellement écrits dans le
 * document (R-030, R-031, R-032) : bon technicien, bonne date, vocabulaire, et
 * jamais de document « signature du collaborateur » sans sa signature.
 */

type SpyTarget = Record<string, (...args: unknown[]) => unknown>;
const asMock = (fn: unknown): Mock => fn as Mock;

const cycle: PdfSignature[] = [
  { type: 'it_cachet', pdfType: 'mise_disposition', signed: true, signedAt: new Date('2026-09-01T08:00:00Z'), signerEmail: 'alice.a@livio.fr', mentionLuApprouve: true, isInPerson: true },
  { type: 'mise_disposition', signed: true, signedAt: new Date('2026-09-01T09:00:00Z'), signerEmail: 'lea.martin@livio.fr', mentionLuApprouve: true },
  { type: 'it_cachet', pdfType: 'restitution', signed: true, signedAt: new Date('2026-09-04T08:00:00Z'), signerEmail: 'theo.b@livio.fr', mentionLuApprouve: true, isInPerson: true },
  { type: 'restitution', signed: true, signedAt: new Date('2026-09-04T09:00:00Z'), signerEmail: 'lea.martin@livio.fr', mentionLuApprouve: true },
];

function bon(overrides: Partial<BonForPdf> = {}): BonForPdf {
  return {
    id: 'bon-1',
    reference: 'BON-2026-0042',
    civilite: 'mme',
    status: 'archived',
    filialeId: 'filiale-1',
    dateMiseDisposition: new Date('2026-09-01T00:00:00Z'),
    filiale: { displayName: 'Livio Nord' },
    collaborateur: { displayName: 'Léa Martin' },
    collaborateurEmail: 'lea.martin@livio.fr',
    createdBy: { displayName: 'Créateur Du Bon' },
    equipments: [{ id: 'eq-1', customLabel: 'Portable', serialNumber: 'SN1', returnedAt: new Date('2026-09-04T08:00:00Z') }],
    signatures: cycle,
    ...overrides,
  };
}

describe('PdfService — vérité du document', () => {
  let service: PdfService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let texts: string[];
  let textSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createMockPrismaService();
    asMock(prisma.user.findMany).mockResolvedValue([
      { email: 'alice.a@livio.fr', displayName: 'Alice André' },
      { email: 'theo.b@livio.fr', displayName: 'Théo Bernard' },
      { email: 'Lea.Martin@livio.fr', displayName: 'Léa Martin' },
    ]);
    asMock(prisma.filiale.findUnique).mockResolvedValue({ stampPath: null });
    asMock(prisma.pdfSnapshot.findFirst).mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfTemplatesService, useValue: { getTemplateConfig: (id: string) => Promise.resolve(structuredClone(DEFAULT_CONFIGS[id])) } },
        { provide: EncryptionService, useValue: createMockEncryptionService() },
      ],
    }).compile();
    service = module.get(PdfService);
    texts = [];
    const original = PDFDocument.prototype.text;
    textSpy = vi.spyOn(PDFDocument.prototype as unknown as SpyTarget, 'text').mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
      if (typeof args[0] === 'string') texts.push(args[0]);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    } as never);
  });

  afterEach(() => textSpy.mockRestore());

  const joined = () => texts.join('\n');

  it('PDF de restitution : le technicien de la restitution et la date de la restitution', async () => {
    await service.generateAndSave(bon(), 'signature_collab_restitution', null, 'f.pdf');
    const all = joined();
    expect(texts).toContain('Théo Bernard');
    expect(all).not.toContain('Créateur Du Bon\nSERVICE');
    expect(texts).toContain('Date : 04/09/2026');
    expect(texts).not.toContain('Date : 01/09/2026');
    expect(all).toContain('Équipe informatique — signature IT — restitution');
    expect(all).not.toContain('Collaborateur — mise à disposition');
    expect(all).not.toMatch(/cachet/i);
  });

  it('PDF de remise : le technicien de la remise', async () => {
    await service.generateAndSave(bon({ status: 'active' }), 'signature_collab_mise_disposition', null, 'f.pdf');
    expect(texts).toContain('Alice André');
    expect(texts).not.toContain('Théo Bernard');
  });

  it('refuse un document « signature du collaborateur » sans signature du collaborateur (R-031)', async () => {
    const withoutRestitution = bon({ signatures: cycle.slice(0, 3) });
    await expect(service.generateAndSave(withoutRestitution, 'signature_collab_restitution', null, 'f.pdf')).rejects.toThrow(
      /n'a pas signé ce document/,
    );
    expect(prisma.pdfSnapshot.create).not.toHaveBeenCalled();
  });

  it('remise sans signature : rangée sous remise_sans_signature, motif et technicien imprimés', async () => {
    const handover = bon({
      status: 'active',
      signatures: cycle.slice(0, 1),
      _withoutSignature: { kind: 'handover', reason: 'Compagnon sans téléphone', actorName: 'Alice André', at: new Date('2026-09-02T10:00:00Z') },
    });
    await service.generateAndSave(handover, 'remise_sans_signature', null, 'f.pdf');
    const saved = asMock(prisma.pdfSnapshot.create).mock.calls[0][0] as { data: { type: string } };
    expect(saved.data.type).toBe('remise_sans_signature');
    expect(joined()).toContain('REMISE CONSTATÉE SANS SIGNATURE');
    expect(joined()).toContain('Motif : Compagnon sans téléphone\nConstaté par Alice André le 02/09/2026');
    expect(joined()).not.toContain('Lu et approuvé — Je reconnais avoir reçu');
  });

  it('ancienne clôture (texte libre) demandée comme « signature collab » : rangée sous cloture_sans_signature', async () => {
    const legacy = bon({ signatures: cycle.slice(0, 3), _unilateralNote: 'Départ sans restitution' });
    await service.generateAndSave(legacy, 'signature_collab_restitution', null, 'f.pdf');
    const saved = asMock(prisma.pdfSnapshot.create).mock.calls[0][0] as { data: { type: string } };
    expect(saved.data.type).toBe('cloture_sans_signature');
  });

  it('constat déjà rédigé demandé comme remise_sans_signature : reste une remise, texte imprimé tel quel', async () => {
    const note = 'REMISE CONSTATÉE SANS SIGNATURE — le 02/09/2026 par Alice André. Motif : absent';
    await service.generateAndSave(bon({ status: 'active', signatures: cycle.slice(0, 1), _unilateralNote: note }), 'remise_sans_signature', null, 'f.pdf');
    const saved = asMock(prisma.pdfSnapshot.create).mock.calls[0][0] as { data: { type: string } };
    expect(saved.data.type).toBe('remise_sans_signature');
    expect(texts).toContain(note);
    expect(joined()).toContain('BON DE MISE À DISPOSITION — REMISE CONSTATÉE SANS SIGNATURE');
  });

  it('signature au guichet sur le compte du technicien : au nom du collaborateur, technicien présent', async () => {
    const witnessed: PdfSignature = { ...cycle[3], isInPerson: true, signedByProxy: false, signerEmail: 'theo.b@livio.fr' };
    await service.generateAndSave(bon({ signatures: [...cycle.slice(0, 3), witnessed] }), 'signature_collab_restitution', null, 'f.pdf');
    expect(texts).toContain('Mme Léa Martin');
    expect(texts).toContain('Date : 04/09/2026 — au guichet, en présence de Théo Bernard');
    expect(texts).toContain('Signature au guichet');
    expect(joined()).not.toMatch(/mandataire/i);
  });

  it('signature au guichet par le titulaire sur son compte : « au guichet », sans témoin', async () => {
    const own: PdfSignature = { ...cycle[3], isInPerson: true, signedByProxy: false, signerEmail: 'lea.martin@livio.fr' };
    await service.generateAndSave(bon({ signatures: [...cycle.slice(0, 3), own] }), 'signature_collab_restitution', null, 'f.pdf');
    expect(texts).toContain('Date : 04/09/2026 — au guichet');
  });

  it('mandataire réel : signé par lui, pour le compte du collaborateur', async () => {
    const proxy: PdfSignature = { ...cycle[3], isInPerson: true, signedByProxy: true, signerEmail: 'alice.a@livio.fr' };
    await service.generateAndSave(bon({ signatures: [...cycle.slice(0, 3), proxy] }), 'signature_collab_restitution', null, 'f.pdf');
    expect(texts).toContain('Date : 04/09/2026 — au guichet, signé par Alice André (mandataire)');
    expect(texts).toContain('Signature au guichet — mandataire');
    expect(joined()).toContain('Pour le compte de');
  });

  it('restitution partielle : seuls les rendus sous « restitués », les autres sous « Restent chez le collaborateur », jamais « En attente »', async () => {
    const partial = bon({
      status: 'partially_returned',
      equipments: [
        { id: 'eq-1', customLabel: 'Portable', serialNumber: 'SN1', returnedAt: new Date('2026-09-04T08:00:00Z') },
        { id: 'eq-2', customLabel: 'Écran', serialNumber: 'SN2', returnedAt: null },
      ],
    });
    await service.generateAndSave(partial, 'signature_collab_restitution', null, 'f.pdf');
    const all = joined();
    expect(all).toContain('RESTENT CHEZ LE COLLABORATEUR');
    expect(texts).toContain('Reste chez le collaborateur');
    expect(texts).not.toContain('En attente');
    expect(all.indexOf('Portable')).toBeLessThan(all.indexOf('RESTENT CHEZ LE COLLABORATEUR'));
    expect(all.indexOf('Écran')).toBeGreaterThan(all.indexOf('RESTENT CHEZ LE COLLABORATEUR'));
  });

  it('document de restitution daté de sa signature, pas de la remise', async () => {
    await service.generateAndSave(bon(), 'signature_collab_restitution', null, 'f.pdf');
    const header = texts.slice(0, 12).join(' ');
    expect(header).toContain('04/09/2026');
    expect(header).not.toContain('01/09/2026');
  });

  it('cachet de la filiale : lu par filialeId', async () => {
    await service.generateBonPdf(bon(), null, 'restitution');
    expect(prisma.filiale.findUnique).toHaveBeenCalledWith({ where: { id: 'filiale-1' }, select: { stampPath: true } });
  });

  it('PV : titre « PV de non-restitution », statut « Non restitué »', async () => {
    const pvBon = bon({
      status: 'partially_returned',
      equipments: [{ id: 'eq-1', customLabel: 'Portable', notReturned: true, notReturnedReason: 'Perdu' }],
      signatures: [...cycle.slice(0, 2), { type: 'it_cachet', pdfType: 'pv_cloture', signed: true, signedAt: new Date('2026-09-10T08:00:00Z'), signerEmail: 'theo.b@livio.fr' }],
    });
    await service.generateAndSave(pvBon, 'cloture_equipements_manquants', null, 'f.pdf');
    expect(joined()).toContain('PV DE NON-RESTITUTION');
    expect(texts).toContain('Non restitué');
    expect(joined()).not.toMatch(/non rendu/i);
    expect(texts).toContain('Théo Bernard');
  });
});

describe('loadDocumentSignatureImages', () => {
  it('lit les images des signatures retenues, pas d’autres', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmad-sig-'));
    try {
      writeFileSync(join(dir, 'it.enc'), 'encrypted:SVQ=');
      writeFileSync(join(dir, 'collab.enc'), 'encrypted:Q09MTEFC');
      writeFileSync(join(dir, 'other.enc'), 'encrypted:T1RIRVI=');
      const store = { encryption: createMockEncryptionService() as unknown as EncryptionService, signaturesDir: dir };
      const images = await loadDocumentSignatureImages(store, {
        it: { type: 'it_cachet', signed: true, signatureImagePath: 'it.enc' },
        collab: { type: 'restitution', signed: true, signatureImagePath: 'collab.enc' },
      });
      expect(images).toEqual({ it: 'data:image/png;base64,SVQ=', collab: 'data:image/png;base64,Q09MTEFC' });
      const traversal = await loadDocumentSignatureImages(store, {
        it: { type: 'it_cachet', signed: true, signatureImagePath: '../other.enc' },
        collab: null,
      });
      expect(traversal).toEqual({ it: null, collab: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
