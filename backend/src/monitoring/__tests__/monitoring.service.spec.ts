import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from '../monitoring.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { JOB_REGISTRY } from '../job-registry';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let configService: ReturnType<typeof createMockConfigService>;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.scheduledJobRun.findMany.mockResolvedValue([]);
    configService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('retourne "dev" pour version/commit quand les variables d\'environnement sont absentes', async () => {
    delete process.env.APP_VERSION;
    delete process.env.APP_COMMIT;

    const status = await service.getAdminStatus();

    expect(status.version).toBe('dev');
    expect(status.commit).toBe('dev');
  });

  it("reprend APP_VERSION et APP_COMMIT quand définies", async () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.APP_COMMIT = 'abcdef0';

    const status = await service.getAdminStatus();

    expect(status.version).toBe('1.2.3');
    expect(status.commit).toBe('abcdef0');
  });

  it('renvoie database: "ok" quand le SELECT 1 réussit', async () => {
    const status = await service.getAdminStatus();
    expect(status.database).toBe('ok');
  });

  it('renvoie database: "unreachable" quand le SELECT 1 échoue', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connexion refusée'));

    const status = await service.getAdminStatus();

    expect(status.database).toBe('unreachable');
  });

  it('renvoie une entrée pour chacune des 5 tâches planifiées, avec label et schedule', async () => {
    const status = await service.getAdminStatus();

    expect(status.jobs).toHaveLength(JOB_REGISTRY.length);
    for (const def of JOB_REGISTRY) {
      const entry = status.jobs.find((j) => j.job === def.job);
      expect(entry).toBeDefined();
      expect(entry?.label).toBe(def.label);
      expect(entry?.schedule).toBe(def.schedule);
    }
  });

  it("reprend les champs de la dernière exécution d'une tâche connue en base", async () => {
    prisma.scheduledJobRun.findMany.mockResolvedValue([
      {
        job: 'ldap-sync',
        lastStartedAt: new Date('2026-09-19T06:00:00Z'),
        lastFinishedAt: new Date('2026-09-19T06:00:05Z'),
        lastStatus: 'success',
        lastError: null,
        lastDurationMs: 5000,
        updatedAt: new Date('2026-09-19T06:00:05Z'),
      },
    ]);

    const status = await service.getAdminStatus();

    const ldap = status.jobs.find((j) => j.job === 'ldap-sync');
    expect(ldap).toMatchObject({
      lastStartedAt: '2026-09-19T06:00:00.000Z',
      lastFinishedAt: '2026-09-19T06:00:05.000Z',
      lastStatus: 'success',
      lastError: null,
      lastDurationMs: 5000,
    });
  });

  it("renvoie des champs nuls et late=false pour une tâche jamais exécutée juste après le démarrage", async () => {
    const status = await service.getAdminStatus();

    const ldap = status.jobs.find((j) => j.job === 'ldap-sync');
    expect(ldap?.lastStartedAt).toBeNull();
    expect(ldap?.lastStatus).toBeNull();
    expect(ldap?.late).toBe(false);
  });

  // ─── Seuil "en retard" de la synchro LDAP — dépend de ldap.sync_interval_hours ─

  describe('seuil "en retard" de la synchro LDAP (ldap.sync_interval_hours)', () => {
    it("n'est pas en retard avec un intervalle configuré de 24 h et un dernier succès il y a 20 h", async () => {
      configService.set('ldap', 'sync_interval_hours', '24');
      prisma.scheduledJobRun.findMany.mockResolvedValue([
        {
          job: 'ldap-sync',
          lastStartedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          lastFinishedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          lastStatus: 'success',
          lastError: null,
          lastDurationMs: 1000,
          updatedAt: new Date(),
        },
      ]);

      const status = await service.getAdminStatus();

      expect(status.jobs.find((j) => j.job === 'ldap-sync')?.late).toBe(false);
    });

    it('est en retard avec le même intervalle de 24 h passé 48 h sans succès', async () => {
      configService.set('ldap', 'sync_interval_hours', '24');
      prisma.scheduledJobRun.findMany.mockResolvedValue([
        {
          job: 'ldap-sync',
          lastStartedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
          lastFinishedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
          lastStatus: 'success',
          lastError: null,
          lastDurationMs: 1000,
          updatedAt: new Date(),
        },
      ]);

      const status = await service.getAdminStatus();

      expect(status.jobs.find((j) => j.job === 'ldap-sync')?.late).toBe(true);
    });

    it('retombe sur 6 h (repli) quand ldap.sync_interval_hours est absent ou invalide', async () => {
      configService.set('ldap', 'sync_interval_hours', 'pas-un-nombre');
      prisma.scheduledJobRun.findMany.mockResolvedValue([
        {
          job: 'ldap-sync',
          lastStartedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          lastFinishedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          lastStatus: 'success',
          lastError: null,
          lastDurationMs: 1000,
          updatedAt: new Date(),
        },
      ]);

      const status = await service.getAdminStatus();

      // Repli 6h → seuil 12h ; 13h > 12h → en retard
      expect(status.jobs.find((j) => j.job === 'ldap-sync')?.late).toBe(true);
    });

    it("n'affecte pas le seuil des autres tâches", async () => {
      configService.set('ldap', 'sync_interval_hours', '48');
      prisma.scheduledJobRun.findMany.mockResolvedValue([
        {
          job: 'smb-retry',
          lastStartedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          lastFinishedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          lastStatus: 'success',
          lastError: null,
          lastDurationMs: 1000,
          updatedAt: new Date(),
        },
      ]);

      const status = await service.getAdminStatus();

      // smb-retry : seuil fixe 12h (registre), inchangé par l'intervalle LDAP
      expect(status.jobs.find((j) => j.job === 'smb-retry')?.late).toBe(true);
    });
  });
});
