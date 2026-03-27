import { Test, TestingModule } from '@nestjs/testing';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import { SmbService } from '../smb.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

jest.mock('fs/promises');
jest.mock('fs');

describe('SmbService', () => {
  let service: SmbService;
  let configService: ReturnType<typeof createMockConfigService>;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const mockBon = {
    id: 'bon-1',
    reference: 'BON-2026-0001',
    createdAt: new Date('2026-03-27'),
    filiale: { displayName: 'Livio Paris', name: 'livio-paris' },
    collaborateur: { displayName: 'Jean Dupont' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService = createMockConfigService();
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmbService,
        { provide: AppConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
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
      prisma.smbExport.create.mockResolvedValue({ id: 'exp-1' });
      prisma.smbExport.update.mockResolvedValue({});
      (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);

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
      prisma.smbExport.create.mockResolvedValue({ id: 'exp-2' });
      prisma.smbExport.update.mockResolvedValue({});
      (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsPromises.writeFile as jest.Mock).mockRejectedValue(new Error('EACCES: permission denied'));

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
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);

      const result = await service.testConnection();

      expect(result.success).toBe(true);
    });
  });

  describe('retryOne', () => {
    it('should return error when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.retryOne('exp-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('non activé');
    });
  });

  describe('retryAllFailed', () => {
    it('should return zeros when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      const result = await service.retryAllFailed();

      expect(result).toEqual({ retried: 0, succeeded: 0, failed: 0 });
    });
  });

  describe('cronRetryFailedExports', () => {
    it('should do nothing when SMB disabled', async () => {
      configService.get.mockResolvedValue(null);

      await service.cronRetryFailedExports();

      expect(prisma.smbExport.count).not.toHaveBeenCalled();
    });

    it('should do nothing when no failed exports', async () => {
      configService.get.mockResolvedValue('true');
      prisma.smbExport.count.mockResolvedValue(0);

      await service.cronRetryFailedExports();

      expect(prisma.smbExport.findMany).not.toHaveBeenCalled();
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
  });
});
