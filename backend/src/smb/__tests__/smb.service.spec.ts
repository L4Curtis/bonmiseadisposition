import { Test, TestingModule } from '@nestjs/testing';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import { SmbService } from '../smb.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockConfigService, createMockJobTrackerService } from '../../common/__tests__/helpers/mock-services';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { JobTrackerService } from '../../monitoring/job-tracker.service';
import type { Mock } from 'vitest';

vi.mock('fs/promises');
vi.mock('fs');

describe('SmbService', () => {
  let service: SmbService;
  let configService: ReturnType<typeof createMockConfigService>;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let jobTracker: ReturnType<typeof createMockJobTrackerService>;

  const mockBon = {
    id: 'bon-1',
    reference: 'BON-2026-0001',
    createdAt: new Date('2026-03-27'),
    filiale: { displayName: 'Livio Paris', name: 'livio-paris' },
    collaborateur: { displayName: 'Jean Dupont' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configService = createMockConfigService();
    prisma = createMockPrismaService();
    jobTracker = createMockJobTrackerService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmbService,
        { provide: AppConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        { provide: JobTrackerService, useValue: jobTracker },
      ],
    }).compile();

    service = module.get<SmbService>(SmbService);
  });

  describe('exportPdf', () => {
    it('should skip when SMB is disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result).toEqual({ success: true, skipped: true });
      expect(prisma.smbExport.create).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should return error when SMB enabled but no path configured', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('chemin');
    });

    it('should create tracking record, write file and mark success', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      (fs.existsSync as Mock).mockReturnValue(true);
      prisma.smbExport.create.mockResolvedValue({ id: 'exp-1' });
      prisma.smbExport.update.mockResolvedValue({});
      (fsPromises.mkdir as Mock).mockResolvedValue(undefined);
      (fsPromises.writeFile as Mock).mockResolvedValue(undefined);

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result).toEqual({ success: true });
      expect(prisma.smbExport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bonId: 'bon-1',
            filename: 'test.pdf',
            status: 'pending',
          }),
        }),
      );
      expect(prisma.smbExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-1' },
          data: expect.objectContaining({ status: 'success' }),
        }),
      );
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it('should track failure when file write fails', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      (fs.existsSync as Mock).mockReturnValue(true);
      prisma.smbExport.create.mockResolvedValue({ id: 'exp-2' });
      prisma.smbExport.update.mockResolvedValue({});
      (fsPromises.mkdir as Mock).mockResolvedValue(undefined);
      (fsPromises.writeFile as Mock).mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('EACCES');
      expect(prisma.smbExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-2' },
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('EACCES'),
          }),
        }),
      );
    });

    it('should reject path traversal in filename', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });

      const result = await service.exportPdf(mockBon, '../../../etc/passwd', Buffer.from('pdf'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalide');
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should reject unsafe export paths', async () => {
      // On Windows, /etc resolves differently, so test with a known-blocked path pattern
      // On Linux/Docker (production), this blocks /etc, /proc, etc.
      const blockedPath = process.platform === 'win32' ? '' : '/etc';
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve(blockedPath);
        return Promise.resolve(null);
      });

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result.success).toBe(false);
    });

    it('should fail explicitly (without creating the root) when the share is not mounted', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = await service.exportPdf(mockBon, 'test.pdf', Buffer.from('pdf'));

      expect(result.success).toBe(false);
      expect(result.error).toContain("n'existe pas ou le partage n'est pas monté");
      // Jamais de création automatique de la racine (mkdir recursive local)
      expect(fsPromises.mkdir).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
      // L'échec est tracé (visible dans le monitoring, réessayable une fois le partage monté)
      expect(prisma.smbExport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ bonId: mockBon.id, filename: 'test.pdf', status: 'failed', errorMessage: expect.stringContaining("n'est pas monté") }),
      });
    });
  });

  describe('getStatus', () => {
    it('should return enabled: false when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const status = await service.getStatus();

      expect(status).toEqual({ enabled: false });
      expect(prisma.smbExport.count).not.toHaveBeenCalled();
    });

    it('should return counts when SMB enabled', async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // success
        .mockResolvedValueOnce(1)  // failed
        .mockResolvedValueOnce(1); // pending
      prisma.smbExport.findFirst.mockResolvedValue({ lastAttemptAt: new Date('2026-03-27') });

      const status = await service.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.total).toBe(10);
      expect(status.success).toBe(8);
      expect(status.failed).toBe(1);
      expect(status.pending).toBe(1);
    });
  });

  describe('getFailedExports', () => {
    it('should return empty when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.getFailedExports();

      expect(result).toEqual([]);
    });

    it('should return failed exports with bon reference', async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          bonId: 'bon-1',
          filename: 'test.pdf',
          errorMessage: 'EACCES',
          retryCount: 1,
          lastAttemptAt: new Date(),
          createdAt: new Date(),
          bon: { reference: 'BON-2026-0001' },
        },
      ]);

      const result = await service.getFailedExports();

      expect(result).toHaveLength(1);
      expect(result[0].bonReference).toBe('BON-2026-0001');
      expect(result[0].errorMessage).toBe('EACCES');
    });
  });

  describe('testConnection', () => {
    it('should return error when no path configured', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('chemin');
    });

    it('should succeed when path is writable', async () => {
      configService.get.mockResolvedValue('/mnt/share');
      (fs.existsSync as Mock).mockReturnValue(true);
      (fsPromises.writeFile as Mock).mockResolvedValue(undefined);
      (fsPromises.unlink as Mock).mockResolvedValue(undefined);

      const result = await service.testConnection();

      expect(result.success).toBe(true);
    });

    it('should fail explicitly (without creating the root) when the share is not mounted', async () => {
      const smbPath = '/mnt/share';
      configService.get.mockResolvedValue(smbPath);
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("n'existe pas ou le partage n'est pas monté");
      // Assertion discriminante : ni création de dossier sur la racine, ni
      // tentative d'écriture du fichier-sonde — la fonction doit sortir AVANT
      // toute opération disque, pas seulement s'abstenir de mkdirSync (API
      // qui n'est de toute façon plus appelée par le code actuel).
      expect(fsPromises.mkdir).not.toHaveBeenCalledWith(smbPath, expect.anything());
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('retryOne', () => {
    it('should return error when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.retryOne('exp-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non activé');
    });

    it('should retry successfully when the snapshot filename matches exactly', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      (fs.existsSync as Mock).mockReturnValue(true);
      (fsPromises.mkdir as Mock).mockResolvedValue(undefined);
      (fsPromises.writeFile as Mock).mockResolvedValue(undefined);
      prisma.smbExport.findUnique.mockResolvedValue({
        id: 'exp-1',
        status: 'failed',
        filename: 'BON-1_Jean_signature_collab_mise_disposition.pdf',
        bon: {
          reference: 'BON-2026-0001',
          createdAt: new Date('2026-01-01'),
          filiale: { displayName: 'Livio' },
          collaborateur: { displayName: 'Jean' },
          pdfSnapshots: [
            { filename: 'BON-1_Jean_signature_collab_mise_disposition.pdf', data: Buffer.from('pdf-data') },
          ],
        },
      });
      prisma.smbExport.update.mockResolvedValue({});

      const result = await service.retryOne('exp-1');

      expect(result.success).toBe(true);
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    // Régression : avant correctif, l'absence de correspondance retombait sur
    // pdfSnapshots[0] et écrivait un document ARBITRAIRE sous ce nom de
    // fichier (ex. la clôture unilatérale, dont le PDF n'est jamais persisté
    // comme PdfSnapshot sous ce nom — voir bons.service.ts).
    it('should fail explicitly (no arbitrary fallback) when no snapshot matches the export filename', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      prisma.smbExport.findUnique.mockResolvedValue({
        id: 'exp-2',
        status: 'failed',
        filename: 'BON-1_Jean_signature_collab_mise_disposition_cloture_unilaterale.pdf',
        bon: {
          reference: 'BON-2026-0001',
          pdfSnapshots: [
            { filename: 'BON-1_Jean_cloture_equipements_manquants.pdf', data: Buffer.from('unrelated-document') },
          ],
        },
      });
      prisma.smbExport.update.mockResolvedValue({});

      const result = await service.retryOne('exp-2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Snapshot introuvable pour ce fichier');
      expect(prisma.smbExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-2' },
          data: expect.objectContaining({ status: 'failed', errorMessage: 'Snapshot introuvable pour ce fichier' }),
        }),
      );
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('should fail explicitly (without creating the root) when the share is not mounted during a retry', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      (fs.existsSync as Mock).mockReturnValue(false);
      prisma.smbExport.findUnique.mockResolvedValue({
        id: 'exp-3',
        status: 'failed',
        filename: 'BON-1_Jean_signature_collab_mise_disposition.pdf',
        bon: {
          reference: 'BON-2026-0001',
          pdfSnapshots: [
            { filename: 'BON-1_Jean_signature_collab_mise_disposition.pdf', data: Buffer.from('pdf-data') },
          ],
        },
      });

      const result = await service.retryOne('exp-3');

      expect(result.success).toBe(false);
      expect(result.error).toContain("n'existe pas ou le partage n'est pas monté");
      expect(fsPromises.mkdir).not.toHaveBeenCalled();
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
      // Le compteur de tentatives n'est pas incrémenté pour un chemin non monté
      // (config invalide), au même titre qu'un chemin SMB non sûr.
      expect(prisma.smbExport.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ retryCount: expect.anything() }) }),
      );
    });
  });

  describe('retryAllFailed', () => {
    it('should return zeros when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.retryAllFailed();

      expect(result).toEqual({ retried: 0, succeeded: 0, failed: 0 });
    });

    it('should fail explicitly (no arbitrary fallback) when no snapshot matches an export filename', async () => {
      configService.get.mockImplementation((cat: string, key: string) => {
        if (cat === 'smb' && key === 'enabled') return Promise.resolve('true');
        if (cat === 'smb' && key === 'path') return Promise.resolve('/mnt/share');
        return Promise.resolve(null);
      });
      prisma.smbExport.findMany.mockResolvedValue([
        {
          id: 'exp-4',
          status: 'failed',
          filename: 'BON-1_Jean_signature_collab_mise_disposition_cloture_unilaterale.pdf',
          bon: {
            reference: 'BON-2026-0001',
            pdfSnapshots: [
              { filename: 'BON-1_Jean_cloture_equipements_manquants.pdf', data: Buffer.from('unrelated-document') },
            ],
          },
        },
      ]);
      prisma.smbExport.update.mockResolvedValue({});

      const result = await service.retryAllFailed();

      expect(result).toEqual({ retried: 1, succeeded: 0, failed: 1 });
      expect(prisma.smbExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-4' },
          data: expect.objectContaining({ status: 'failed', errorMessage: 'Snapshot introuvable pour ce fichier' }),
        }),
      );
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('cronRetryFailedExports', () => {
    it('should do nothing when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      await service.cronRetryFailedExports();

      expect(prisma.smbExport.count).not.toHaveBeenCalled();
    });

    it('signale "skipped" au suivi quand SMB est désactivé', async () => {
      configService.get.mockResolvedValue(null);

      await service.cronRetryFailedExports();

      expect(jobTracker.track).toHaveBeenCalledWith('smb-retry', expect.any(Function));
      await expect(jobTracker.track.mock.results[0].value).resolves.toBe('skipped');
    });

    it('should do nothing when no failed exports', async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.count.mockResolvedValue(0);

      await service.cronRetryFailedExports();

      expect(prisma.smbExport.findMany).not.toHaveBeenCalled();
    });

    it('ne signale pas "skipped" (succès) quand SMB est activé, même sans export en échec', async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.count.mockResolvedValue(0);
      prisma.smbExport.updateMany.mockResolvedValue({ count: 0 });

      await service.cronRetryFailedExports();

      await expect(jobTracker.track.mock.results[0].value).resolves.toBeUndefined();
    });

    it("propage l'échec au suivi quand le retry lève une exception", async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.updateMany.mockRejectedValue(new Error('DB indisponible'));

      await service.cronRetryFailedExports();

      const outcome = jobTracker.track.mock.results[0].value as Promise<unknown>;
      await expect(outcome).rejects.toThrow('DB indisponible');
    });
  });

  describe('sanitizeName', () => {
    it('should remove accents', () => {
      expect(service.sanitizeName('Éloïse Bénédicte')).toBe('Eloise-Benedicte');
    });

    it('should replace spaces with hyphens', () => {
      expect(service.sanitizeName('Jean Marie')).toBe('Jean-Marie');
    });

    it('should remove special characters', () => {
      expect(service.sanitizeName("L'entreprise (test)")).toBe('Lentreprise-test');
    });

    it('should collapse multiple hyphens', () => {
      expect(service.sanitizeName('a - - b')).toBe('a-b');
    });

    // Régression : trim() était appliqué APRÈS la conversion espaces → tirets,
    // donc un espace de tête/fin devenait un tiret de tête/fin ('-Jean-')
    // au lieu d'être retiré.
    it('should not leave leading/trailing hyphens for a name with surrounding whitespace', () => {
      expect(service.sanitizeName('  Jean  ')).toBe('Jean');
    });

    it('should fall back to INCONNU for a name with no Latin characters', () => {
      expect(service.sanitizeName('Иван Иванов')).toBe('INCONNU');
    });

    it('should suffix a reserved Windows device name', () => {
      expect(service.sanitizeName('CON')).toBe('CON_');
      expect(service.sanitizeName('con')).toBe('con_');
      expect(service.sanitizeName('LPT1')).toBe('LPT1_');
    });

    it('should not suffix a name that merely contains a reserved word', () => {
      expect(service.sanitizeName('CONSTANTIN')).toBe('CONSTANTIN');
    });
  });
});
