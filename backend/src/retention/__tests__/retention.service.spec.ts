import { RetentionService } from '../retention.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false) }));
jest.mock('fs/promises', () => ({ unlink: jest.fn().mockResolvedValue(undefined) }));

describe('RetentionService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: jest.Mock };
  let attachments: { purgeForBon: jest.Mock };
  let service: RetentionService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = { get: jest.fn().mockResolvedValue(null) };
    attachments = { purgeForBon: jest.fn().mockResolvedValue(2) };
    service = new RetentionService(prisma as never, config as never, attachments as never);
  });

  describe('preview', () => {
    it('counts eligible bons without modifying anything', async () => {
      (prisma.bon.count as jest.Mock).mockResolvedValue(5);
      const r = await service.preview();
      expect(r.eligible).toBe(5);
      expect(r.dryRun).toBe(true);
      expect(prisma.bon.update).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('dry run does not anonymize', async () => {
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      const r = await service.run(true);
      expect(r.anonymized).toBe(0);
      expect(prisma.bon.update).not.toHaveBeenCalled();
      expect(attachments.purgeForBon).not.toHaveBeenCalled();
    });

    it('anonymizes eligible bons: purges PII, attachments and proofs', async () => {
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      (prisma.signature.findMany as jest.Mock).mockResolvedValue([]); // pas de fichiers

      const r = await service.run(false);

      expect(r.anonymized).toBe(1);
      expect(r.attachmentsPurged).toBe(2);
      expect(attachments.purgeForBon).toHaveBeenCalledWith('b1');
      expect(prisma.signature.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1' },
        data: expect.objectContaining({ signerEmail: null, signatureImagePath: null }),
      });
      expect(prisma.pdfSnapshot.deleteMany).toHaveBeenCalledWith({ where: { bonId: 'b1' } });
      expect(prisma.proofArchive.deleteMany).toHaveBeenCalledWith({ where: { bonId: 'b1' } });
      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({ collaborateurEmail: 'anonymise@rgpd.local', anonymizedAt: expect.any(Date) }),
        }),
      );
    });

    it('uses the configured retention window', async () => {
      config.get.mockImplementation((cat: string, key: string) =>
        Promise.resolve(key === 'anonymize_months' ? '12' : null),
      );
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([]);
      const r = await service.run(true);
      // cutoff ~ 12 mois en arrière
      const cutoffYear = new Date(r.cutoff).getFullYear();
      expect(cutoffYear).toBeLessThanOrEqual(new Date().getFullYear());
      expect(r.eligible).toBe(0);
    });
  });
});
