import { Test, TestingModule } from '@nestjs/testing';
import { JobTrackerService } from '../job-tracker.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('JobTrackerService', () => {
  let service: JobTrackerService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobTrackerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<JobTrackerService>(JobTrackerService);
  });

  it('enregistre le début puis un succès, avec la durée, quand fn résout normalement', async () => {
    const result = await service.track('ldap-sync', async () => 'ok');

    expect(result).toBe('ok');
    expect(prisma.scheduledJobRun.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.scheduledJobRun.upsert).toHaveBeenNthCalledWith(1, {
      where: { job: 'ldap-sync' },
      create: expect.objectContaining({ job: 'ldap-sync', lastStartedAt: expect.any(Date) }),
      update: expect.objectContaining({ lastStartedAt: expect.any(Date) }),
    });
    expect(prisma.scheduledJobRun.upsert).toHaveBeenNthCalledWith(2, {
      where: { job: 'ldap-sync' },
      create: expect.objectContaining({
        job: 'ldap-sync',
        lastStatus: 'success',
        lastError: null,
        lastDurationMs: expect.any(Number),
      }),
      update: expect.objectContaining({
        lastStatus: 'success',
        lastError: null,
        lastDurationMs: expect.any(Number),
      }),
    });
  });

  it('enregistre "skipped" quand fn résout avec la valeur "skipped"', async () => {
    const result = await service.track('smb-retry', async () => 'skipped' as const);

    expect(result).toBe('skipped');
    expect(prisma.scheduledJobRun.upsert).toHaveBeenNthCalledWith(2, {
      where: { job: 'smb-retry' },
      create: expect.objectContaining({ lastStatus: 'skipped', lastError: null }),
      update: expect.objectContaining({ lastStatus: 'skipped', lastError: null }),
    });
  });

  it('enregistre "error" avec le message tronqué à 500 caractères et RE-LANCE l\'erreur inchangée', async () => {
    const longMessage = 'x'.repeat(600);

    await expect(
      service.track('retention', async () => {
        throw new Error(longMessage);
      }),
    ).rejects.toThrow(longMessage);

    const secondCall = prisma.scheduledJobRun.upsert.mock.calls[1][0] as {
      update: { lastStatus: string; lastError: string };
    };
    expect(secondCall.update.lastStatus).toBe('error');
    expect(secondCall.update.lastError.length).toBe(501); // 500 + "…"
    expect(secondCall.update.lastError.startsWith('x'.repeat(500))).toBe(true);
  });

  it('ne tronque pas un message déjà court', async () => {
    await expect(
      service.track('retention', async () => {
        throw new Error('Connexion refusée');
      }),
    ).rejects.toThrow('Connexion refusée');

    const secondCall = prisma.scheduledJobRun.upsert.mock.calls[1][0] as {
      update: { lastError: string };
    };
    expect(secondCall.update.lastError).toBe('Connexion refusée');
  });

  it("n'échoue jamais et n'empêche pas fn de s'exécuter quand l'écriture du suivi est en échec", async () => {
    prisma.scheduledJobRun.upsert.mockRejectedValue(new Error('DB indisponible'));

    const result = await service.track('ldap-sync', async () => 'ok');

    expect(result).toBe('ok');
  });

  it("propage toujours l'erreur de fn, même si l'écriture d'échec du suivi échoue aussi", async () => {
    prisma.scheduledJobRun.upsert.mockRejectedValue(new Error('DB indisponible'));

    await expect(
      service.track('ldap-sync', async () => {
        throw new Error('Échec métier');
      }),
    ).rejects.toThrow('Échec métier');
  });
});
