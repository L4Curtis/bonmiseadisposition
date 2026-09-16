import { AppConfigService } from '../config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let encryption: ReturnType<typeof createMockEncryptionService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    encryption = createMockEncryptionService();
    service = new AppConfigService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
    );
  });

  function mockStoredValue(value: string | null) {
    prisma.appConfig.findUnique.mockResolvedValue(
      value === null ? null : { category: 'rappels', key: 'signature_overdue_days', value, encrypted: false },
    );
  }

  describe('getInt', () => {
    it('renvoie fallback quand la clé est absente', async () => {
      mockStoredValue(null);
      const n = await service.getInt('rappels', 'signature_overdue_days', { fallback: 7, min: 1 });
      expect(n).toBe(7);
    });

    it('renvoie fallback pour une valeur non numérique', async () => {
      mockStoredValue('abc');
      const n = await service.getInt('rappels', 'signature_overdue_days', { fallback: 7, min: 1 });
      expect(n).toBe(7);
    });

    it('borne au minimum une valeur en-dessous', async () => {
      mockStoredValue('0');
      const n = await service.getInt('rappels', 'signature_overdue_days', { fallback: 7, min: 1 });
      expect(n).toBe(1);
    });

    it('borne au maximum une valeur au-dessus', async () => {
      mockStoredValue('999');
      const n = await service.getInt('tokens', 'expiry_days', { fallback: 7, min: 1, max: 30 });
      expect(n).toBe(30);
    });

    it('renvoie la valeur telle quelle quand elle est dans les bornes', async () => {
      mockStoredValue('3');
      const n = await service.getInt('rappels', 'signature_overdue_days', { fallback: 7, min: 1 });
      expect(n).toBe(3);
    });
  });

  describe('getSignatureOverdueDays', () => {
    it.each([
      [null, 7],
      ['3', 3],
      ['0', 1],
      ['abc', 7],
    ])('valeur stockée %s → %i', async (stored, expected) => {
      mockStoredValue(stored);
      expect(await service.getSignatureOverdueDays()).toBe(expected);
    });
  });
});
