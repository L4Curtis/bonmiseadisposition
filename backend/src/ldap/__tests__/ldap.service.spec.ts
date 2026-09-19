import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { LdapService } from '../ldap.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockJobTrackerService } from '../../common/__tests__/helpers/mock-services';
import { JobTrackerService } from '../../monitoring/job-tracker.service';

// Accès aux méthodes privées d'upsert/désactivation pour les tester isolément
// sans simuler tout le flux LDAP (bind + search par événements).
interface PrivateLdapService {
  upsertUsers: (users: Array<{ sAMAccountName: string; displayName: string; mail: string; department?: string; company?: string; title?: string }>) => Promise<{ skipped: number }>;
  deactivateAbsentUsers: (syncStart: Date) => Promise<{ aborted: boolean; abortMessage: string | null }>;
}

// Mock ldapjs — we never want real LDAP connections in unit tests
const mockClient = {
  bind: jest.fn(),
  search: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn(),
};

jest.mock('ldapjs', () => {
  // Return a factory so mockClient is captured at runtime, not hoist-time
  return {
    createClient: jest.fn().mockImplementation(() => mockClient),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ldapMock = require('ldapjs') as { createClient: jest.Mock };

describe('LdapService', () => {
  let service: LdapService;
  let configService: ReturnType<typeof createMockConfigService>;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let jobTracker: ReturnType<typeof createMockJobTrackerService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = createMockPrismaService();
    configService = createMockConfigService();
    jobTracker = createMockJobTrackerService();

    // Default LDAP config
    configService.set('ldap', 'enabled', 'true');
    configService.set('ldap', 'url', 'ldap://dc.test.local');
    configService.set('ldap', 'bind_dn', 'cn=admin,dc=test,dc=local');
    configService.set('ldap', 'bind_password', 'secret');
    configService.set('ldap', 'search_base', 'dc=test,dc=local');
    configService.set('ldap', 'user_filter', '(objectClass=person)');
    configService.set('ldap', 'use_ssl', 'false');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LdapService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: configService },
        { provide: JobTrackerService, useValue: jobTracker },
      ],
    }).compile();

    service = module.get<LdapService>(LdapService);
  });

  // ─── scheduledSync (branchement du suivi — lot A5) ─────────────────────────

  describe('scheduledSync', () => {
    it('signale "skipped" au suivi quand LDAP est désactivé, sans lancer de sync', async () => {
      configService.set('ldap', 'enabled', 'false');
      const syncUsersSpy = jest.spyOn(service, 'syncUsers');

      await service.scheduledSync();

      expect(jobTracker.track).toHaveBeenCalledWith('ldap-sync', expect.any(Function));
      await expect(jobTracker.track.mock.results[0].value).resolves.toBe('skipped');
      expect(syncUsersSpy).not.toHaveBeenCalled();
    });

    it('signale "skipped" au suivi quand aucune URL LDAP n\'est configurée', async () => {
      configService.set('ldap', 'url', '');

      await service.scheduledSync();

      await expect(jobTracker.track.mock.results[0].value).resolves.toBe('skipped');
    });

    it("n'appelle PAS le suivi quand le passage est reporté par un intervalle admin > 6h (report normal, pas une désactivation)", async () => {
      configService.set('ldap', 'sync_interval_hours', '24');
      // Dernière sync il y a 2h : bien en-deçà des ~23h30 requis avant le
      // prochain passage utile pour un intervalle de 24h.
      (service as unknown as { syncStatus: { lastSync: Date } }).syncStatus = {
        lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000),
      } as never;
      const syncUsersSpy = jest.spyOn(service, 'syncUsers');

      await service.scheduledSync();

      expect(jobTracker.track).not.toHaveBeenCalled();
      expect(syncUsersSpy).not.toHaveBeenCalled();
    });

    it('ne signale pas "skipped" et propage l\'échec au suivi quand la sync échoue', async () => {
      jest.spyOn(service, 'syncUsers').mockImplementation(async () => {
        // Reproduit le comportement réel de syncUsers() : elle avale ses
        // erreurs et se contente de mettre à jour syncStatus (jamais de rejet).
        (service as unknown as { syncStatus: { lastSyncSuccess: boolean; lastSyncError: string } }).syncStatus = {
          lastSyncSuccess: false,
          lastSyncError: 'LDAP bind failed: invalid credentials',
        };
      });

      await service.scheduledSync();

      const outcome = jobTracker.track.mock.results[0].value as Promise<unknown>;
      await expect(outcome).rejects.toThrow('LDAP bind failed: invalid credentials');
    });

    it('ne signale rien de particulier (succès) quand la sync réussit', async () => {
      jest.spyOn(service, 'syncUsers').mockImplementation(async () => {
        (service as unknown as { syncStatus: { lastSyncSuccess: boolean } }).syncStatus = {
          lastSyncSuccess: true,
        } as never;
      });

      await service.scheduledSync();

      await expect(jobTracker.track.mock.results[0].value).resolves.toBeUndefined();
    });
  });

  // ─── validateLdapFilter ────────────────────────────────────────────────────

  describe('validateLdapFilter', () => {
    it('should accept valid filter: (objectClass=person)', () => {
      expect(() => service.validateLdapFilter('(objectClass=person)')).not.toThrow();
    });

    it('should reject empty filter', () => {
      expect(() => service.validateLdapFilter('')).toThrow('Filtre LDAP manquant');
    });

    it('should reject filter too long (>512 chars)', () => {
      const longFilter = '(' + 'a'.repeat(512) + ')';
      expect(() => service.validateLdapFilter(longFilter)).toThrow('trop long');
    });

    it('should reject filter with null byte', () => {
      expect(() => service.validateLdapFilter('(cn=\0admin)')).toThrow('caractère nul');
    });

    it('should reject unbalanced parentheses', () => {
      expect(() => service.validateLdapFilter('(cn=test))')).toThrow('parenthèses non équilibrées');
      expect(() => service.validateLdapFilter('((cn=test)')).toThrow('parenthèses non équilibrées');
    });

    it('should reject filter not starting with (', () => {
      expect(() => service.validateLdapFilter('cn=test)')).toThrow('doit commencer par');
    });
  });

  // ─── testConnection ────────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('should return success for valid connection', async () => {
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(null),
      );

      const result = await service.testConnection();

      expect(result).toEqual({ success: true, message: 'Connexion LDAP réussie' });
      expect(ldapMock.createClient).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
    });

    it('should return failure message on error', async () => {
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) =>
          cb(new Error('Connection refused')),
      );

      const result = await service.testConnection();

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('Connection refused'),
      });
    });

    // ─── traduction des erreurs TLS/LDAP (LOT A6 — LDAPS) ───────────────────

    it('translates an untrusted-CA TLS error into an actionable French message, hiding the raw detail', async () => {
      configService.set('ldap', 'url', 'ldaps://peduzzi-ad01.peduzzi.local:636');
      configService.set('ldap', 'use_ssl', 'true');
      const tlsError = Object.assign(new Error('unable to verify the first certificate'), {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      });
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(tlsError),
      );

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('NODE_EXTRA_CA_CERTS');
      expect(result.message).not.toContain('unable to verify the first certificate');
    });
  });

  // ─── syncUsers ─────────────────────────────────────────────────────────────

  describe('syncUsers', () => {
    it('should skip when LDAP disabled', async () => {
      configService.set('ldap', 'enabled', 'false');

      await service.syncUsers();

      expect(ldapMock.createClient).not.toHaveBeenCalled();
    });

    it('should search with server-side paging (LOT C bug #8)', async () => {
      mockClient.bind.mockImplementation((_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(null));
      mockClient.search.mockImplementation(
        (_base: string, _opts: unknown, cb: (err: Error | null, res: unknown) => void) => {
          const handlers: Record<string, (...args: unknown[]) => void> = {};
          cb(null, {
            on: (event: string, handler: (...args: unknown[]) => void) => {
              handlers[event] = handler;
              if (event === 'end') handler(null);
            },
          });
        },
      );
      prisma.filiale.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await service.syncUsers();

      expect(mockClient.search).toHaveBeenCalledWith(
        'dc=test,dc=local',
        expect.objectContaining({ paged: { pageSize: 500 } }),
        expect.any(Function),
      );
    });
  });

  // ─── cohérence use_ssl / schéma de l'URL (LOT A6 — LDAPS) ───────────────────

  describe('createClient — cohérence use_ssl / URL', () => {
    it('refuse de se connecter quand use_ssl=true mais que l\'URL est restée en ldap:// (texte clair)', async () => {
      configService.set('ldap', 'url', 'ldap://dc.test.local');
      configService.set('ldap', 'use_ssl', 'true');

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('ldaps://');
      expect(ldapMock.createClient).not.toHaveBeenCalled();
    });

    it("applique des tlsOptions sûrs (rejectUnauthorized: true) dès que l'URL est ldaps://, même si use_ssl=false", async () => {
      configService.set('ldap', 'url', 'ldaps://peduzzi-ad01.peduzzi.local:636');
      configService.set('ldap', 'use_ssl', 'false');
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(null),
      );

      await service.testConnection();

      expect(ldapMock.createClient).toHaveBeenCalledWith(
        expect.objectContaining({ tlsOptions: { rejectUnauthorized: true } }),
      );
    });

    it("n'ajoute pas de tlsOptions sur une URL ldap:// cohérente (use_ssl=false)", async () => {
      configService.set('ldap', 'url', 'ldap://dc.test.local');
      configService.set('ldap', 'use_ssl', 'false');
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error | null) => void) => cb(null),
      );

      await service.testConnection();

      expect(ldapMock.createClient).toHaveBeenCalledWith(
        expect.objectContaining({ tlsOptions: undefined }),
      );
    });
  });

  // ─── upsertUsers (collision handling — LOT C bug #6c) ───────────────────────

  describe('upsertUsers', () => {
    const ldapUser = {
      sAMAccountName: 'jdupont',
      displayName: 'Jean Dupont',
      mail: 'Jean.Dupont@Exemple.fr',
      department: undefined,
      company: undefined,
      title: undefined,
    };

    beforeEach(() => {
      prisma.filiale.findMany.mockResolvedValue([]);
    });

    it('normalizes the email before writing and upserts by sAMAccountName when no match exists', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({});

      const result = await (service as unknown as PrivateLdapService).upsertUsers([ldapUser]);

      expect(result.skipped).toBe(0);
      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { samAccountName: 'jdupont' },
          update: expect.objectContaining({ email: 'jean.dupont@exemple.fr' }),
        }),
      );
    });

    it('updates the existing record by id when found by email under a different sAMAccountName', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', samAccountName: 'old.sam' });
      prisma.user.update.mockResolvedValue({});

      const result = await (service as unknown as PrivateLdapService).upsertUsers([ldapUser]);

      expect(result.skipped).toBe(0);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });

    it('continues past a P2002 collision on one user instead of aborting the whole sync', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.upsert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const secondUser = { ...ldapUser, sAMAccountName: 'other', mail: 'other@exemple.fr' };
      prisma.user.upsert.mockResolvedValueOnce(undefined as never).mockResolvedValueOnce({});

      const result = await (service as unknown as PrivateLdapService).upsertUsers([ldapUser, secondUser]);

      // First user's P2002 is counted as skipped; the second is still processed.
      expect(result.skipped).toBe(1);
      expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    });

    // ─── comptes manuels : jamais écrasés par la synchronisation ────────────

    it('never overwrites a manual account matched by email — skips it instead', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'manual-1',
        samAccountName: 'manuel.jean.dupont',
        isManualAccount: true,
      });

      const result = await (service as unknown as PrivateLdapService).upsertUsers([ldapUser]);

      expect(result.skipped).toBe(1);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });

    it('never overwrites a manual account matched by sAMAccountName — skips it instead', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // no email match
      prisma.user.findUnique.mockResolvedValue({ id: 'manual-2', isManualAccount: true });

      const result = await (service as unknown as PrivateLdapService).upsertUsers([ldapUser]);

      expect(result.skipped).toBe(1);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── deactivateAbsentUsers (mass-deactivation guardrail — LOT C bug #7) ─────

  describe('deactivateAbsentUsers', () => {
    it('deactivates absent accounts when under the 20% threshold', async () => {
      prisma.user.count
        .mockResolvedValueOnce(2) // toDeactivate
        .mockResolvedValueOnce(100); // activeLdapAccounts
      prisma.user.updateMany.mockResolvedValue({ count: 2 });

      const result = await (service as unknown as PrivateLdapService).deactivateAbsentUsers(new Date());

      expect(result).toEqual({ aborted: false, abortMessage: null });
      expect(prisma.user.updateMany).toHaveBeenCalled();
    });

    it('aborts when >20% AND at least 5 accounts would be deactivated', async () => {
      prisma.user.count
        .mockResolvedValueOnce(30) // toDeactivate
        .mockResolvedValueOnce(100); // activeLdapAccounts (30% > 20%)

      const result = await (service as unknown as PrivateLdapService).deactivateAbsentUsers(new Date());

      expect(result.aborted).toBe(true);
      expect(result.abortMessage).toContain('Sync interrompue');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ldap_sync_aborted' }) }),
      );
    });

    it('does NOT abort when the ratio is high but the absolute count is below the floor', async () => {
      prisma.user.count
        .mockResolvedValueOnce(3) // toDeactivate — below MASS_DEACTIVATION_MIN_COUNT (5)
        .mockResolvedValueOnce(5); // activeLdapAccounts (60% ratio, but too few accounts to matter)
      prisma.user.updateMany.mockResolvedValue({ count: 3 });

      const result = await (service as unknown as PrivateLdapService).deactivateAbsentUsers(new Date());

      expect(result.aborted).toBe(false);
      expect(prisma.user.updateMany).toHaveBeenCalled();
    });

    // ─── comptes manuels : jamais désactivés, jamais comptés (LOT compagnons) ─

    it('excludes manual accounts explicitly (isManualAccount: false) from the deactivation query and its ratio denominator', async () => {
      prisma.user.count
        .mockResolvedValueOnce(2) // toDeactivate
        .mockResolvedValueOnce(100); // activeLdapAccounts
      prisma.user.updateMany.mockResolvedValue({ count: 2 });

      await (service as unknown as PrivateLdapService).deactivateAbsentUsers(new Date());

      expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
        where: expect.objectContaining({ isManualAccount: false }),
      });
      expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({ isManualAccount: false }),
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ isManualAccount: false }),
        data: { active: false },
      });
    });
  });
});
