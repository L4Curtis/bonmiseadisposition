import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService, UploadedFile } from '../attachments.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(true), mkdirSync: jest.fn() }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngFile(extra = 100): UploadedFile {
  const buffer = Buffer.concat([PNG_MAGIC, Buffer.alloc(extra, 1)]);
  return { buffer, originalname: 'photo.png', mimetype: 'image/png', size: buffer.length };
}

describe('AttachmentsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let encryption: ReturnType<typeof createMockEncryptionService>;
  let service: AttachmentsService;
  const user = { id: 'u1', email: 'tech@x.fr' };

  beforeEach(() => {
    prisma = createMockPrismaService();
    encryption = createMockEncryptionService();
    service = new AttachmentsService(prisma as never, encryption as never);
    (prisma.bon.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', reference: 'BMD-1', anonymizedAt: null });
    (prisma.attachment.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'att-1', createdAt: new Date(), ...data }),
    );
  });

  describe('create', () => {
    it('rejects when no file is provided', async () => {
      await expect(service.create('b1', undefined, 'restitution', undefined, user)).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-image/pdf file (magic bytes)', async () => {
      const txt: UploadedFile = { buffer: Buffer.from('hello world'), originalname: 'x.txt', mimetype: 'text/plain', size: 11 };
      await expect(service.create('b1', txt, 'general', undefined, user)).rejects.toThrow(/non autorisé/);
    });

    it('rejects a file over 10 MB', async () => {
      const big = pngFile(11 * 1024 * 1024);
      await expect(service.create('b1', big, 'general', undefined, user)).rejects.toThrow(/volumineux/);
    });

    it('rejects upload on an anonymized bon', async () => {
      (prisma.bon.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', reference: 'BMD-1', anonymizedAt: new Date() });
      await expect(service.create('b1', pngFile(), 'general', undefined, user)).rejects.toThrow(/anonymisé/);
    });

    it('stores an encrypted PNG and returns safe metadata (no storedPath)', async () => {
      const result = await service.create('b1', pngFile(), 'restitution', 'Écran rayé', user);
      expect(encryption.encrypt).toHaveBeenCalled();
      expect(prisma.attachment.create).toHaveBeenCalled();
      const created = (prisma.attachment.create as jest.Mock).mock.calls[0][0].data;
      expect(created.mimeType).toBe('image/png');
      expect(created.stage).toBe('restitution');
      expect(created.sha256).toMatch(/^[0-9a-f]{64}$/);
      // La réponse ne fuit pas le chemin de stockage interne
      expect(result).not.toHaveProperty('storedPath');
      expect(result.label).toBe('Écran rayé');
    });

    it('falls back to the "general" stage for an unknown stage', async () => {
      await service.create('b1', pngFile(), 'n_importe_quoi', undefined, user);
      const created = (prisma.attachment.create as jest.Mock).mock.calls[0][0].data;
      expect(created.stage).toBe('general');
    });
  });

  describe('download', () => {
    it('decrypts and returns the buffer for a matching bon', async () => {
      const original = pngFile().buffer;
      (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({
        id: 'att-1', bonId: 'b1', storedPath: 'b1_restitution_1.png.enc', filename: 'photo.png', mimeType: 'image/png',
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsp = require('fs/promises');
      fsp.readFile.mockResolvedValue(`encrypted:${original.toString('base64')}`);

      const r = await service.download('b1', 'att-1');
      expect(r.filename).toBe('photo.png');
      expect(r.buffer.equals(original)).toBe(true);
    });

    it('rejects when the attachment belongs to another bon', async () => {
      (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({ id: 'att-1', bonId: 'OTHER', storedPath: 'x.enc' });
      await expect(service.download('b1', 'att-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the row and audits', async () => {
      (prisma.attachment.findUnique as jest.Mock).mockResolvedValue({ id: 'att-1', bonId: 'b1', storedPath: 'x.png.enc', filename: 'photo.png' });
      (prisma.attachment.delete as jest.Mock).mockResolvedValue({});
      const r = await service.remove('b1', 'att-1', user);
      expect(r.ok).toBe(true);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });
  });

  describe('purgeForBon', () => {
    it('deletes all attachment rows for a bon', async () => {
      (prisma.attachment.findMany as jest.Mock).mockResolvedValue([{ id: 'a', storedPath: 'a.enc' }]);
      (prisma.attachment.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      const n = await service.purgeForBon('b1');
      expect(n).toBe(1);
      expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({ where: { bonId: 'b1' } });
    });
  });
});
