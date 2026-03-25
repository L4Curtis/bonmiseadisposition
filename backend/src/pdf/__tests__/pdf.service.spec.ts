import { Test, TestingModule } from '@nestjs/testing';
import { PdfService, BonForPdf, SigImages } from '../pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: PrismaService, useValue: prisma },
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
        update: { data: expect.any(Buffer), filename: 'bon-test.pdf' },
        create: {
          bonId: bon.id,
          type: 'signature_collab_mise_disposition',
          data: expect.any(Buffer),
          filename: 'bon-test.pdf',
        },
      });
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
});
