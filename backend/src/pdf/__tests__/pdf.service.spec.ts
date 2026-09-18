import { createHash } from 'crypto';
import * as PDFDocument from 'pdfkit';
import { Test, TestingModule } from '@nestjs/testing';
import { PdfService, BonForPdf, SigImages } from '../pdf.service';
import { PdfTemplatesService } from '../pdf-templates.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../config/encryption.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockPdfTemplatesService, createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';
import { activeBon, partiallyReturnedBon } from '../../common/__tests__/fixtures/bon.fixtures';

// Helper to access jest.Mock methods on deeply-nested prisma mocks
const asMock = (fn: unknown): jest.Mock => fn as jest.Mock;

describe('PdfService', () => {
  let service: PdfService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const noSigImages: SigImages = { it: null, collab: null };

  function bonForPdf(overrides: Partial<BonForPdf> = {}): BonForPdf {
    const bon = activeBon();
    return {
      id: bon.id,
      reference: bon.reference,
      civilite: bon.civilite,
      status: bon.status,
      dateMiseDisposition: bon.dateMiseDisposition,
      dateRestitution: bon.dateRestitution ?? undefined,
      notes: bon.notes ?? undefined,
      filiale: {
        displayName: bon.filiale.displayName,
        name: bon.filiale.name,
        logoPath: bon.filiale.logoPath,
        address: bon.filiale.address,
        siret: bon.filiale.siret,
      },
      collaborateur: {
        displayName: bon.collaborateur.displayName,
        department: bon.collaborateur.department,
      },
      collaborateurEmail: bon.collaborateurEmail,
      createdBy: {
        displayName: bon.createdBy.displayName,
      },
      equipments: bon.equipments.map((eq) => ({
        id: eq.id,
        catalogItem: eq.catalogItem
          ? { brand: eq.catalogItem.brand, model: eq.catalogItem.model }
          : null,
        customLabel: eq.customLabel,
        serialNumber: eq.serialNumber,
        inventoryNumber: eq.inventoryNumber,
        notes: eq.notes,
        returnedAt: eq.returnedAt,
        notReturned: eq.notReturned,
        notReturnedReason: eq.notReturnedReason,
      })),
      signatures: bon.signatures.map((sig) => ({
        type: sig.type,
        signed: sig.signed,
        signedAt: sig.signedAt,
        signatureImagePath: sig.signatureImagePath,
      })),
      ...overrides,
    };
  }

  function partialBonForPdf(): BonForPdf {
    const bon = partiallyReturnedBon();
    return {
      id: bon.id,
      reference: bon.reference,
      civilite: bon.civilite,
      status: bon.status,
      dateMiseDisposition: bon.dateMiseDisposition,
      dateRestitution: bon.dateRestitution ?? undefined,
      notes: bon.notes ?? undefined,
      filiale: {
        displayName: bon.filiale.displayName,
        name: bon.filiale.name,
        logoPath: bon.filiale.logoPath,
        address: bon.filiale.address,
        siret: bon.filiale.siret,
      },
      collaborateur: {
        displayName: bon.collaborateur.displayName,
        department: bon.collaborateur.department,
      },
      collaborateurEmail: bon.collaborateurEmail,
      createdBy: {
        displayName: bon.createdBy.displayName,
      },
      equipments: bon.equipments.map((eq) => ({
        id: eq.id,
        catalogItem: eq.catalogItem
          ? { brand: eq.catalogItem.brand, model: eq.catalogItem.model }
          : null,
        customLabel: eq.customLabel,
        serialNumber: eq.serialNumber,
        inventoryNumber: eq.inventoryNumber,
        notes: eq.notes,
        returnedAt: eq.returnedAt,
        notReturned: eq.notReturned,
        notReturnedReason: eq.notReturnedReason,
      })),
      signatures: bon.signatures.map((sig) => ({
        type: sig.type,
        signed: sig.signed,
        signedAt: sig.signedAt,
        signatureImagePath: sig.signatureImagePath,
      })),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createMockPrismaService();
    const mockPdfTemplatesService = createMockPdfTemplatesService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfTemplatesService, useValue: mockPdfTemplatesService },
        { provide: EncryptionService, useValue: createMockEncryptionService() },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  // ─── generateAndSave ──────────────────────────────────────────────────────

  describe('generateAndSave', () => {
    it('should generate PDF buffer and save snapshot', async () => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      const bon = bonForPdf();

      const result = await service.generateAndSave(
        bon,
        'signature_collab_mise_disposition',
        noSigImages,
        'bon-test.pdf',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
      // PDF magic bytes: %PDF
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
      expect(prisma.pdfSnapshot.upsert).toHaveBeenCalled();
    });

    it('should reject oversized PDFs (>10MB)', async () => {
      const bon = bonForPdf();
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB

      // Spy on the private renderPdf to return a huge buffer
      jest.spyOn(service as never, 'renderPdf' as never).mockResolvedValue(
        hugeBuffer as never,
      );

      await expect(
        service.generateAndSave(
          bon,
          'signature_collab_mise_disposition',
          noSigImages,
          'big.pdf',
        ),
      ).rejects.toThrow('PDF trop volumineux');
    });

    it('should upsert snapshot in database', async () => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      const bon = bonForPdf();

      await service.generateAndSave(
        bon,
        'signature_collab_mise_disposition',
        noSigImages,
        'bon-test.pdf',
      );

      expect(prisma.pdfSnapshot.upsert).toHaveBeenCalledWith({
        where: {
          bonId_type: {
            bonId: bon.id,
            type: 'signature_collab_mise_disposition',
          },
        },
        update: { data: expect.any(Buffer), filename: 'bon-test.pdf', sha256: expect.any(String) },
        create: {
          bonId: bon.id,
          type: 'signature_collab_mise_disposition',
          data: expect.any(Buffer),
          filename: 'bon-test.pdf',
          sha256: expect.any(String),
        },
      });
    });

    it('should record the SHA-256 of the document in snapshot and audit', async () => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      const bon = bonForPdf();

      const pdf = await service.generateAndSave(
        bon,
        'signature_collab_restitution',
        noSigImages,
        'bon-test.pdf',
      );

      const expectedHash = createHash('sha256').update(pdf).digest('hex');
      const upsertArgs = asMock(prisma.pdfSnapshot.upsert).mock.calls[0][0] as {
        create: { sha256: string };
      };
      expect(upsertArgs.create.sha256).toBe(expectedHash);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'pdf_snapshot_saved',
            details: expect.objectContaining({ sha256: expectedHash }),
          }),
        }),
      );
    });

    it('should never overwrite an existing signed mise-à-disposition snapshot', async () => {
      const existingData = Buffer.from('%PDF-existing-signed-document');
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue({ id: 'snap-001', data: existingData });
      const bon = bonForPdf();

      const result = await service.generateAndSave(
        bon,
        'signature_collab_mise_disposition',
        noSigImages,
        'bon-test.pdf',
      );

      // Le document DÉJÀ archivé est retourné tel quel (jamais un nouveau
      // rendu) : la preuve légale ne doit jamais varier une fois signée.
      expect(result).toBeInstanceOf(Buffer);
      expect(result.equals(existingData)).toBe(true);
      expect(prisma.pdfSnapshot.upsert).not.toHaveBeenCalled();
    });

    // ─── Chaîne de preuve atomique (archive + snapshot + audit) ─────────────

    it('should write the proof archive, the snapshot and the audit log inside the same transaction, in order', async () => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      const order: string[] = [];
      asMock(prisma.proofArchive.create).mockImplementation(async () => { order.push('proofArchive'); return {}; });
      asMock(prisma.pdfSnapshot.upsert).mockImplementation(async () => { order.push('pdfSnapshot'); return {}; });
      asMock(prisma.auditLog.create).mockImplementation(async () => { order.push('auditLog'); return {}; });

      await service.generateAndSave(bonForPdf(), 'signature_collab_restitution', noSigImages, 'bon-test.pdf');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(order).toEqual(['proofArchive', 'pdfSnapshot', 'auditLog']);
    });

    it('should propagate a proof archive failure and NOT upsert the snapshot (atomicity)', async () => {
      asMock(prisma.proofArchive.create).mockRejectedValue(new Error('DB down'));

      await expect(
        service.generateAndSave(bonForPdf(), 'signature_collab_restitution', noSigImages, 'bon-test.pdf'),
      ).rejects.toThrow('DB down');

      expect(prisma.pdfSnapshot.upsert).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should propagate an audit log failure (never swallowed)', async () => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      asMock(prisma.auditLog.create).mockRejectedValue(new Error('audit write failed'));

      await expect(
        service.generateAndSave(bonForPdf(), 'signature_collab_restitution', noSigImages, 'bon-test.pdf'),
      ).rejects.toThrow('audit write failed');
    });
  });

  // ─── generateBonPdf ───────────────────────────────────────────────────────

  describe('generateBonPdf', () => {
    it('should generate mise_disposition PDF', async () => {
      const bon = bonForPdf();

      const result = await service.generateBonPdf(bon, noSigImages, 'mise_disposition');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should generate restitution PDF', async () => {
      const bon = bonForPdf({
        status: 'sent_restitution',
        dateRestitution: new Date(),
      });

      const result = await service.generateBonPdf(bon, noSigImages, 'restitution');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should generate cloture PDF', async () => {
      const bon = partialBonForPdf();

      const result = await service.generateBonPdf(bon, noSigImages, 'cloture');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should generate a PDF without error when the collaborator has no email address (manual account)', async () => {
      const bon = bonForPdf({ collaborateurEmail: null });

      const result = await service.generateBonPdf(bon, noSigImages, 'mise_disposition');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
    });

    // ─── Cachet de filiale : ne doit jamais chevaucher la case IT ───────────

    it('should never overlap the IT signature box with the stamp (stampY >= sigY + 145)', async () => {
      const stampBuffer = Buffer.from('fake-stamp-bytes');

      // getLogoBuffer lit sur disque (data/uploads) — on l'intercepte pour ne
      // renvoyer un buffer QUE pour le chemin du cachet (pas de logo ici).
      const getLogoBufferSpy = jest
        .spyOn(service as never, 'getLogoBuffer' as never)
        .mockImplementation((async (path: string | null) =>
          path === 'uploads/stamp.png' ? stampBuffer : null) as never);

      // drawSignatureBox est appelée avec (doc, x, y, width, opts, colors) —
      // on garde l'implémentation réelle (call-through) pour ne capturer que
      // le `y` de la case IT (1er appel).
      const drawSignatureBoxSpy = jest.spyOn(PdfService.prototype as never, 'drawSignatureBox' as never);

      // doc.image() n'est ici appelée QUE pour le cachet (pas de logo, pas
      // d'encre de signature avec noSigImages) : on la neutralise (pas de
      // vrai décodage d'image) tout en capturant ses arguments.
      const imageCalls: unknown[][] = [];
      const imageSpy = jest
        .spyOn(PDFDocument.prototype as never, 'image' as never)
        .mockImplementation(function (this: unknown, ...args: unknown[]) {
          imageCalls.push(args);
          return this;
        } as never);

      try {
        const bon = bonForPdf({
          filiale: {
            displayName: 'Livio',
            name: 'livio',
            logoPath: null,
            stampPath: 'uploads/stamp.png',
            address: null,
            siret: null,
          },
        });

        await service.generateBonPdf(bon, noSigImages, 'mise_disposition');

        expect(drawSignatureBoxSpy.mock.calls.length).toBeGreaterThan(0);
        // Case IT = premier appel ; 3e argument positionnel = y (sigY)
        const sigY = drawSignatureBoxSpy.mock.calls[0][2] as number;

        const stampCall = imageCalls.find((call) => call[0] === stampBuffer);
        expect(stampCall).toBeDefined();
        const stampY = stampCall![2] as number;

        expect(stampY).toBeGreaterThanOrEqual(sigY + 145);
      } finally {
        getLogoBufferSpy.mockRestore();
        drawSignatureBoxSpy.mockRestore();
        imageSpy.mockRestore();
      }
    });

    // ─── Chaîne de preuve : certificat + déterminisme ───────────────────────

    it('should render the signature certificate for a co-signed bon', async () => {
      const signedAt = new Date('2026-06-10T09:30:00Z');
      const bon = bonForPdf({
        status: 'archived',
        signatures: [
          { type: 'it_cachet', signed: true, signedAt, signatureImagePath: null,
            signerEmail: 'tech@groupelivio.fr', signerIp: '10.0.0.5', signerUserAgent: 'Mozilla/5.0', mentionLuApprouve: true, isInPerson: false },
          { type: 'mise_disposition', signed: true, signedAt, signatureImagePath: null,
            signerEmail: 'jean.dupont@groupelivio.fr', signerIp: '10.0.0.42', signerUserAgent: 'Mozilla/5.0', mentionLuApprouve: true, isInPerson: false },
        ],
      });

      const result = await service.generateBonPdf(bon, noSigImages, 'mise_disposition');
      expect(result.subarray(0, 4).toString()).toBe('%PDF');
      // Le certificat ajoute du contenu : document sensiblement plus volumineux
      const sansCert = await service.generateBonPdf(bonForPdf({ signatures: [] }), noSigImages, 'mise_disposition');
      expect(result.length).toBeGreaterThan(sansCert.length);
    });

    it('should render a DETERMINISTIC PDF (preuve : 2 rendus identiques au byte près)', async () => {
      // Le SHA-256 ne prouve l'intégrité que si le rendu est reproductible :
      // aucune horloge murale, aucun statut volatil dans le document.
      const signedAt = new Date('2026-06-10T09:30:00Z');
      const make = () => bonForPdf({
        status: 'archived',
        signatures: [
          { type: 'mise_disposition', signed: true, signedAt, signatureImagePath: null,
            signerEmail: 'jean.dupont@groupelivio.fr', signerIp: '10.0.0.42', signerUserAgent: 'UA', mentionLuApprouve: true, isInPerson: false },
        ],
      });

      const a = await service.generateBonPdf(make(), noSigImages, 'mise_disposition');
      await new Promise((r) => setTimeout(r, 30)); // l'horloge avance entre les deux rendus
      const b = await service.generateBonPdf(make(), noSigImages, 'mise_disposition');

      // PDFKit insère sa propre date de création (CreationDate/ModDate, littéraux
      // PDF « (D:...) ») et un identifiant de fichier /ID dans les métadonnées —
      // hors du contenu signé. On les neutralise pour comparer le CONTENU rendu.
      const strip = (buf: Buffer) => buf.toString('latin1')
        .replace(/\(D:[^)]*\)/g, '(D:X)')
        .replace(/\/ID\s*\[[^\]]*\]/g, '/ID[X]');
      expect(strip(a)).toBe(strip(b));
    });
  });

  // ─── getDocumentType (tested through generateAndSave) ─────────────────────

  describe('getDocumentType (via generateAndSave)', () => {
    let renderSpy: jest.SpyInstance;

    beforeEach(() => {
      asMock(prisma.pdfSnapshot.upsert).mockResolvedValue({});
      renderSpy = jest.spyOn(service as never, 'renderPdf' as never);
    });

    afterEach(() => {
      renderSpy.mockRestore();
    });

    it('should map signature_collab_mise_disposition to mise_disposition', async () => {
      const bon = bonForPdf();

      await service.generateAndSave(
        bon,
        'signature_collab_mise_disposition',
        noSigImages,
        'f.pdf',
      );

      expect(renderSpy).toHaveBeenCalledWith(bon, noSigImages, 'mise_disposition');
    });

    it('should map signature_collab_restitution to restitution', async () => {
      const bon = bonForPdf({ status: 'sent_restitution' });

      await service.generateAndSave(
        bon,
        'signature_collab_restitution',
        noSigImages,
        'f.pdf',
      );

      expect(renderSpy).toHaveBeenCalledWith(bon, noSigImages, 'restitution');
    });

    it('should map cloture_equipements_manquants to cloture', async () => {
      const bon = partialBonForPdf();

      await service.generateAndSave(
        bon,
        'cloture_equipements_manquants',
        noSigImages,
        'f.pdf',
      );

      expect(renderSpy).toHaveBeenCalledWith(bon, noSigImages, 'cloture');
    });

    it('should map avenant_equipement_retrouve to avenant', async () => {
      const bon = bonForPdf();

      await service.generateAndSave(
        bon,
        'avenant_equipement_retrouve',
        noSigImages,
        'f.pdf',
      );

      expect(renderSpy).toHaveBeenCalledWith(bon, noSigImages, 'avenant');
    });
  });

  // ─── regenerateMissingSnapshots ───────────────────────────────────────────

  describe('regenerateMissingSnapshots', () => {
    let generateAndSaveSpy: jest.SpyInstance;

    beforeEach(() => {
      generateAndSaveSpy = jest.spyOn(service, 'generateAndSave').mockResolvedValue(Buffer.from('%PDF-mock'));
    });

    afterEach(() => {
      generateAndSaveSpy.mockRestore();
    });

    const minimalBon = () => ({
      id: 'bon-1',
      reference: 'BMD-2026-0001',
      civilite: 'mme',
      status: 'archived',
      dateMiseDisposition: new Date('2026-01-01'),
      dateRestitution: null,
      notes: null,
      filiale: { displayName: 'Livio', name: 'livio', logoPath: null, stampPath: null, address: null, siret: null },
      collaborateur: { displayName: 'Jean Dupont', department: null },
      collaborateurEmail: 'jean.dupont@livio.fr',
      createdBy: { displayName: 'Tech' },
      equipments: [],
      signatures: [{ type: 'mise_disposition', signed: true, signedAt: new Date(), signatureImagePath: null }],
    });

    it('should skip a signature whose snapshot already exists', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([{ bonId: 'bon-1', type: 'mise_disposition' }]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue({ id: 'existing' });

      const result = await service.regenerateMissingSnapshots();

      expect(result).toEqual({ regenerated: 0, failed: 0 });
      expect(generateAndSaveSpy).not.toHaveBeenCalled();
    });

    it('should regenerate a missing snapshot for a signed collaborateur signature', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([{ bonId: 'bon-1', type: 'restitution' }]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue(null);
      asMock(prisma.bon.findUnique).mockResolvedValue(minimalBon());

      const result = await service.regenerateMissingSnapshots();

      expect(result).toEqual({ regenerated: 1, failed: 0 });
      expect(generateAndSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bon-1' }),
        'signature_collab_restitution',
        expect.any(Object),
        expect.stringContaining('signature_collab_restitution'),
      );
    });

    // Fallback UNIQUEMENT : signatures sans pdfType (antérieures à LOT H/B).
    it('should fall back to chronological order (1st = mise à disposition, 2nd = restitution) when pdfType is absent', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([
        { bonId: 'bon-1', type: 'it_cachet', pdfType: null },
        { bonId: 'bon-1', type: 'it_cachet', pdfType: null },
      ]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue(null);
      asMock(prisma.bon.findUnique).mockResolvedValue(minimalBon());

      const result = await service.regenerateMissingSnapshots();

      expect(result).toEqual({ regenerated: 2, failed: 0 });
      const types = generateAndSaveSpy.mock.calls.map((c) => c[1]);
      expect(types).toEqual(expect.arrayContaining(['signature_it_mise_disposition', 'signature_it_restitution']));
    });

    // pdfType (LOT H/B) fait foi : ici le 1er cachet chronologique porte
    // pdfType='restitution' — l'heuristique d'ordre seule aurait déduit
    // 'mise_disposition' à tort.
    it('should use signature.pdfType when present instead of the chronological heuristic', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([
        { bonId: 'bon-1', type: 'it_cachet', pdfType: 'restitution' },
      ]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue(null);
      asMock(prisma.bon.findUnique).mockResolvedValue(minimalBon());

      const result = await service.regenerateMissingSnapshots();

      expect(result).toEqual({ regenerated: 1, failed: 0 });
      expect(generateAndSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bon-1' }),
        'signature_it_restitution',
        expect.any(Object),
        expect.stringContaining('signature_it_restitution'),
      );
    });

    it('should mix pdfType and chronological fallback within the same bon', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([
        { bonId: 'bon-1', type: 'it_cachet', pdfType: null }, // 1st, no pdfType -> heuristic: mise_disposition
        { bonId: 'bon-1', type: 'it_cachet', pdfType: 'mise_disposition' }, // 2nd, but pdfType overrides heuristic
      ]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue(null);
      asMock(prisma.bon.findUnique).mockResolvedValue(minimalBon());

      const result = await service.regenerateMissingSnapshots();

      // Les deux signatures déduisent le même snapshot type
      // (signature_it_mise_disposition) : un seul régénéré (Set dédupliqué).
      expect(result).toEqual({ regenerated: 1, failed: 0 });
      expect(generateAndSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bon-1' }),
        'signature_it_mise_disposition',
        expect.any(Object),
        expect.stringContaining('signature_it_mise_disposition'),
      );
    });

    it('should count a failure without throwing when the bon cannot be reloaded', async () => {
      asMock(prisma.signature.findMany).mockResolvedValue([{ bonId: 'bon-missing', type: 'pv_cloture' }]);
      asMock(prisma.pdfSnapshot.findUnique).mockResolvedValue(null);
      asMock(prisma.bon.findUnique).mockResolvedValue(null);

      const result = await service.regenerateMissingSnapshots();

      expect(result).toEqual({ regenerated: 0, failed: 1 });
      expect(generateAndSaveSpy).not.toHaveBeenCalled();
    });
  });
});
