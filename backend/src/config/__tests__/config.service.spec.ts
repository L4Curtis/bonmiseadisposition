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

  describe('getSignatureOverdueDays — selon le registre (7 par défaut, au moins 1)', () => {
    it.each([
      [null, 7],
      ['3', 3],
      ['0', 1],
      ['abc', 7],
      ['7.5', 7],
      ['-3', 1],
      [' 12 ', 12],
    ])('valeur stockée %s → %i', async (stored, expected) => {
      mockStoredValue(stored);
      expect(await service.getSignatureOverdueDays()).toBe(expected);
    });
  });
});

describe('AppConfigService — cohérence entre plusieurs instances', () => {
  // Le cache vit en mémoire : avec plusieurs conteneurs backend, une
  // modification enregistrée par l'un laissait les autres servir l'ancienne
  // valeur jusqu'à 5 minutes (connexion SSO renvoyant vers l'ancienne URL une
  // fois sur deux). La date de dernière écriture sert de version partagée.
  let prisma: ReturnType<typeof createMockPrismaService>;
  let encryption: ReturnType<typeof createMockEncryptionService>;
  let service: AppConfigService;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = createMockPrismaService();
    encryption = createMockEncryptionService();
    prisma.appConfig.aggregate = vi.fn().mockResolvedValue({ _max: { updatedAt: new Date('2026-09-18T10:00:00Z') } });
    service = new AppConfigService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function valeurStockee(value: string) {
    prisma.appConfig.findUnique.mockResolvedValue({ category: 'entra', key: 'redirect_uri', value, encrypted: false });
  }

  it('relit la base quand une autre instance a modifié la configuration', async () => {
    valeurStockee('https://ancienne.local/api/auth/callback');
    expect(await service.get('entra', 'redirect_uri')).toBe('https://ancienne.local/api/auth/callback');

    // Écriture par une AUTRE instance : la date de dernière écriture avance.
    prisma.appConfig.aggregate = vi.fn().mockResolvedValue({ _max: { updatedAt: new Date('2026-09-18T10:05:00Z') } });
    valeurStockee('https://nouvelle.local/api/auth/callback');

    vi.advanceTimersByTime(6000); // au-delà de l'intervalle de vérification
    expect(await service.get('entra', 'redirect_uri')).toBe('https://nouvelle.local/api/auth/callback');
  });

  it('sert le cache sans relire la base tant que rien ne change', async () => {
    valeurStockee('https://stable.local/api/auth/callback');
    await service.get('entra', 'redirect_uri');
    const appelsApresPremiereLecture = prisma.appConfig.findUnique.mock.calls.length;

    vi.advanceTimersByTime(6000);
    await service.get('entra', 'redirect_uri');

    expect(prisma.appConfig.findUnique.mock.calls.length).toBe(appelsApresPremiereLecture);
  });
});
