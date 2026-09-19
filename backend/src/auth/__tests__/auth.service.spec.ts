import { UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth.service';

// Prevent ensureDefaultAdmin/changePassword from touching the real filesystem
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
  unlinkSync: jest.fn(),
}));
import { existsSync, unlinkSync } from 'fs';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { localAdminUser, collaboratorUser, manualAccountUser } from '../../common/__tests__/fixtures/user.fixtures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let configService: ReturnType<typeof createMockConfigService>;

  // A valid strong password used across multiple tests
  const STRONG_PASSWORD = 'MyStr0ng_Pass!';

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };
    configService = createMockConfigService();

    // JWT_SECRET must be set (and ≥ 32 chars) for the service to function
    process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-0123456789abcdef';

    service = new AuthService(
      configService as unknown as AppConfigService,
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    // Clean up the interval created by the constructor
    service.onModuleDestroy();
    delete process.env.JWT_SECRET;
  });

  // ─── localLogin ──────────────────────────────────────────────────────────────

  const TEST_IP = '10.0.0.1';

  describe('localLogin', () => {
    it('should authenticate valid local user', async () => {
      const password = STRONG_PASSWORD;
      const hash = await bcrypt.hash(password, 10);
      const user = {
        ...localAdminUser(),
        passwordHash: hash,
        mustChangePassword: false,
        // Récent : ne doit pas déclencher la dérivation à 90 jours (testée
        // séparément ci-dessous) — le fixture par défaut a une date fixe qui
        // finit par dépasser 90 jours au fil du temps.
        passwordChangedAt: new Date(),
      };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      const result = await service.localLogin(user.email, password, TEST_IP);

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
        mustChangePassword: false,
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: user.email, isLocalAccount: true, active: true },
      });
    });

    it('should normalize email casing/whitespace before lookup', async () => {
      const password = STRONG_PASSWORD;
      const hash = await bcrypt.hash(password, 10);
      const user = { ...localAdminUser(), passwordHash: hash, mustChangePassword: false };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      await service.localLogin(`  ${user.email.toUpperCase()}  `, password, TEST_IP);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: user.email, isLocalAccount: true, active: true },
      });
    });

    it('should derive mustChangePassword when the local password is older than 90 days', async () => {
      const password = STRONG_PASSWORD;
      const hash = await bcrypt.hash(password, 10);
      const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      const user = {
        ...localAdminUser(),
        passwordHash: hash,
        mustChangePassword: false,
        passwordChangedAt: oldDate,
      };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      const result = await service.localLogin(user.email, password, TEST_IP);

      expect(result.mustChangePassword).toBe(true);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('CorrectPassword1!', 10);
      const user = { ...localAdminUser(), passwordHash: hash };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      await expect(
        service.localLogin(user.email, 'WrongPassword1!', TEST_IP),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.localLogin('nobody@local', 'Whatever1!@#', TEST_IP),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when brute-force locked (10+ failures for this account+IP)', async () => {
      prisma.auditLog.count.mockResolvedValue(10);

      await expect(
        service.localLogin('locked@local', 'Whatever1!@#', TEST_IP),
      ).rejects.toThrow(UnauthorizedException);

      // Should NOT even try to look up the user
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('should lock by account+IP but NOT by email alone (LOT C bug #2)', async () => {
      // 10 failures for this email from a DIFFERENT ip, 0 from the current IP
      // and 0 for the IP-wide dimension: must NOT lock.
      prisma.auditLog.count
        .mockResolvedValueOnce(0) // (email, ip) dimension
        .mockResolvedValueOnce(0); // ip-wide dimension

      const password = STRONG_PASSWORD;
      const hash = await bcrypt.hash(password, 10);
      const user = { ...localAdminUser(), passwordHash: hash, mustChangePassword: false };
      prisma.user.findFirst.mockResolvedValue(user);

      await expect(service.localLogin(user.email, password, TEST_IP)).resolves.toBeDefined();
    });

    it('should throw when a single IP has 30+ failures across different targets', async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(0) // (email, ip) dimension — under the per-account threshold
        .mockResolvedValueOnce(30); // ip-wide dimension — credential stuffing

      await expect(
        service.localLogin('anyone@local', 'Whatever1!@#', TEST_IP),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('should never authenticate a manual account (compagnon de chantier) — no password fingerprint, isLocalAccount always false', async () => {
      const manual = manualAccountUser();
      // Locks in the two independent guarantees a manual account relies on:
      // it is never a local account, and it never has a password hash.
      expect(manual.isLocalAccount).toBe(false);
      expect(manual.passwordHash).toBeNull();

      prisma.auditLog.count.mockResolvedValue(0);
      // The production query filters on isLocalAccount: true — a manual
      // account row would never come back from a real database, simulated
      // here by resolving null.
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.localLogin('jean.dupont@exemple.fr', 'Whatever1!@#', TEST_IP),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'jean.dupont@exemple.fr', isLocalAccount: true, active: true },
      });
    });
  });

  // ─── refreshAccessToken ──────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('should issue new tokens with rotation (revoke old)', async () => {
      const oldRefreshToken = 'old-refresh-token';
      const activeUser = { ...localAdminUser(), active: true };

      jwtService.verify.mockReturnValue({ sub: activeUser.id, type: 'refresh' });
      prisma.user.findUniqueOrThrow.mockResolvedValue(activeUser);

      const result = await service.refreshAccessToken(oldRefreshToken);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
      // The old token should now be revoked
      expect(service.isTokenRevoked(oldRefreshToken)).toBe(true);
    });

    it('should throw for revoked refresh token', async () => {
      const revokedToken = 'revoked-refresh-token';
      service.revokeToken(revokedToken);

      await expect(
        service.refreshAccessToken(revokedToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for invalid/expired token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for inactive user', async () => {
      const inactiveUser = { ...localAdminUser(), active: false };
      jwtService.verify.mockReturnValue({ sub: inactiveUser.id, type: 'refresh' });
      prisma.user.findUniqueOrThrow.mockResolvedValue(inactiveUser);

      await expect(
        service.refreshAccessToken('some-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return 503 (not 401) for an unexpected DB error after a valid token (LOT C bug #11)', async () => {
      jwtService.verify.mockReturnValue({ sub: 'some-user-id', type: 'refresh' });
      // The token itself is valid — the failure happens fetching the user (DB down)
      prisma.user.findUniqueOrThrow.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        service.refreshAccessToken('valid-token-db-down'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const currentPw = 'OldPassw0rd_Ok!';
      const newPw = 'NewPassw0rd_Ok!';
      const hash = await bcrypt.hash(currentPw, 10);
      const user = { ...localAdminUser(), passwordHash: hash };

      prisma.user.findUniqueOrThrow.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue({ ...user, mustChangePassword: false });

      await service.changePassword(user.id, currentPw, newPw);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
      // Verify the stored hash is valid bcrypt for the new password
      const callArg = prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      const storedHash = callArg.data.passwordHash;
      const isValid = await bcrypt.compare(newPw, storedHash);
      expect(isValid).toBe(true);
    });

    it('should throw for incorrect current password', async () => {
      const hash = await bcrypt.hash('RealPassword1!', 10);
      const user = { ...localAdminUser(), passwordHash: hash };

      prisma.user.findUniqueOrThrow.mockResolvedValue(user);

      await expect(
        service.changePassword(user.id, 'WrongPassword1!', 'NewP@ssw0rd123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for non-local account', async () => {
      const entraUser = {
        ...collaboratorUser(),
        isLocalAccount: false,
        passwordHash: null,
      };
      prisma.user.findUniqueOrThrow.mockResolvedValue(entraUser);

      await expect(
        service.changePassword(entraUser.id, 'Any1@password', 'NewP@ssw0rd123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should validate password strength (min 12 chars, upper, lower, digit, special)', async () => {
      const currentPw = 'OldPassw0rd_Ok!';
      const hash = await bcrypt.hash(currentPw, 10);
      const user = { ...localAdminUser(), passwordHash: hash };
      prisma.user.findUniqueOrThrow.mockResolvedValue(user);

      // Too short
      await expect(
        service.changePassword(user.id, currentPw, 'Short1!'),
      ).rejects.toThrow(BadRequestException);

      // No uppercase
      await expect(
        service.changePassword(user.id, currentPw, 'nouppercase1!x'),
      ).rejects.toThrow(BadRequestException);

      // No lowercase
      await expect(
        service.changePassword(user.id, currentPw, 'NOLOWERCASE1!X'),
      ).rejects.toThrow(BadRequestException);

      // No digit
      await expect(
        service.changePassword(user.id, currentPw, 'NoDigitHere!!xx'),
      ).rejects.toThrow(BadRequestException);

      // No special character
      await expect(
        service.changePassword(user.id, currentPw, 'NoSpecial12345'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should delete the initial admin password file after admin@local changes password (LOT C bug #11)', async () => {
      const currentPw = 'OldPassw0rd_Ok!';
      const newPw = 'NewPassw0rd_Ok!';
      const hash = await bcrypt.hash(currentPw, 10);
      const admin = { ...localAdminUser(), email: 'admin@local', passwordHash: hash };

      prisma.user.findUniqueOrThrow.mockResolvedValue(admin);
      prisma.user.update.mockResolvedValue({ ...admin, mustChangePassword: false });
      (existsSync as jest.Mock).mockReturnValueOnce(true);

      await service.changePassword(admin.id, currentPw, newPw);

      expect(unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('initial-admin-password.txt'),
      );
    });

    it('should NOT touch the password file for a non-admin@local account', async () => {
      const currentPw = 'OldPassw0rd_Ok!';
      const newPw = 'NewPassw0rd_Ok!';
      const hash = await bcrypt.hash(currentPw, 10);
      const user = { ...localAdminUser(), email: 'someone-else@exemple.fr', passwordHash: hash };

      prisma.user.findUniqueOrThrow.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue({ ...user, mustChangePassword: false });
      (unlinkSync as jest.Mock).mockClear();

      await service.changePassword(user.id, currentPw, newPw);

      expect(unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ─── revokeToken / isTokenRevoked ────────────────────────────────────────────

  describe('revokeToken / isTokenRevoked', () => {
    it('should revoke a token', () => {
      const token = 'some-jwt-token';
      service.revokeToken(token);
      expect(service.isTokenRevoked(token)).toBe(true);
    });

    it('should detect revoked token', () => {
      const token = 'revoked-token-abc';
      service.revokeToken(token);
      expect(service.isTokenRevoked(token)).toBe(true);
    });

    it('should not detect non-revoked token', () => {
      expect(service.isTokenRevoked('never-revoked-token')).toBe(false);
    });

    it(
      "la purge opportuniste déclenchée au-delà de 10000 jetons journalise son échec au lieu de " +
        'produire une promesse rejetée non gérée (cf. fix 057737c)',
      async () => {
        prisma.revokedToken.deleteMany.mockRejectedValue(new Error('Base indisponible'));
        const logger = (service as unknown as { logger: { warn: jest.Mock } }).logger;
        const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

        // Remplit le cache mémoire au-delà du seuil (10000) pour déclencher le
        // chemin onOverCapacity() de revokeTokenImpl (token-revocation.ts).
        for (let i = 0; i < 10001; i++) {
          service.revokeToken(`jeton-${i}`);
        }

        // Laisse la microtask du .catch() de la purge s'exécuter.
        await new Promise((resolve) => setImmediate(resolve));

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Purge des jetons révoqués en échec'),
        );
      },
    );
  });

  // ─── ensureDefaultAdmin ──────────────────────────────────────────────────────

  describe('ensureDefaultAdmin', () => {
    it('should create admin@local when not exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...localAdminUser(),
        email: 'admin@local',
        samAccountName: 'admin_local',
        displayName: 'Administrateur local',
        mustChangePassword: true,
      });

      await service.ensureDefaultAdmin();

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'admin@local',
            role: 'admin',
            isLocalAccount: true,
            isItStaff: true,
            mustChangePassword: true,
            active: true,
          }),
        }),
      );
      // Password hash should be a valid bcrypt hash
      const callArg = prisma.user.create.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(callArg.data.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('should not reset password when admin already exists', async () => {
      const existingAdmin = {
        ...localAdminUser(),
        email: 'admin@local',
        isLocalAccount: true,
      };
      prisma.user.findUnique.mockResolvedValue(existingAdmin);

      await service.ensureDefaultAdmin();

      // Should NOT call create or update (admin exists and is already a local account)
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should silently swallow a P2002 (admin created concurrently) (LOT C bug #11)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.ensureDefaultAdmin()).resolves.toBeUndefined();
    });

    it('should log and rethrow any error that is NOT a P2002 (LOT C bug #11)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.ensureDefaultAdmin()).rejects.toThrow('connect ECONNREFUSED');
    });
  });

  // ─── setAuthCookies / clearAuthCookies ────────────────────────────────────────

  describe('setAuthCookies / clearAuthCookies', () => {
    it('should scope the refresh_token cookie to /api/auth (not /api/auth/refresh) so logout can revoke it (LOT C bug #3)', () => {
      const cookieCalls: Array<[string, string, Record<string, unknown>]> = [];
      const res = {
        cookie: jest.fn((name: string, value: string, opts: Record<string, unknown>) => {
          cookieCalls.push([name, value, opts]);
        }),
      };

      service.setAuthCookies(res as unknown as Response, 'access-tok', 'refresh-tok');

      const refreshCall = cookieCalls.find(([name]) => name === 'refresh_token');
      expect(refreshCall?.[2]).toMatchObject({ path: '/api/auth' });
    });

    it('should clear the refresh_token cookie with the same /api/auth path', () => {
      const clearCalls: Array<[string, Record<string, unknown>]> = [];
      const res = {
        clearCookie: jest.fn((name: string, opts: Record<string, unknown>) => {
          clearCalls.push([name, opts]);
        }),
      };

      service.clearAuthCookies(res as unknown as Response);

      const refreshClear = clearCalls.find(([name]) => name === 'refresh_token');
      expect(refreshClear?.[1]).toMatchObject({ path: '/api/auth' });
    });
  });

  // ─── syncUserRoleFromGroups (mapping Entra) ───────────────────────────────────
  // Méthode privée : appelée via l'accès par crochets, échappatoire documentée
  // de TypeScript pour les tests unitaires (cf. user-throttler.guard.spec.ts
  // pour un autre exemple de test d'un comportement interne).

  describe('syncUserRoleFromGroups (mapping Entra)', () => {
    const userId = 'user-sso-001';

    type PrivateSync = { syncUserRoleFromGroups: (userId: string, groups: string[]) => Promise<void> };

    async function sync(groups: string[]): Promise<void> {
      await (service as unknown as PrivateSync).syncUserRoleFromGroups(userId, groups);
    }

    beforeEach(async () => {
      await configService.set('entra', 'admin_group_id', 'grp-admin');
      await configService.set('entra', 'technician_group_id', 'grp-tech');
      await configService.set('entra', 'direction_group_id', 'grp-direction');
      prisma.user.update.mockResolvedValue({});
    });

    it('promeut admin quand le groupe admin est présent (priorité la plus haute)', async () => {
      await sync(['grp-admin', 'grp-tech', 'grp-direction']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'admin', isItStaff: true },
      });
    });

    it('promeut technician quand seul le groupe technicien matche', async () => {
      await sync(['grp-tech', 'grp-direction']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'technician', isItStaff: true },
      });
    });

    it('promeut direction (isItStaff:false) quand seul le groupe direction matche', async () => {
      await sync(['grp-direction']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'direction', isItStaff: false },
      });
    });

    it('rétrograde en collaborator quand aucun groupe élevé ne matche', async () => {
      await sync(['grp-other']);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'collaborator', isItStaff: false },
      });
    });

    it('rétrograde un utilisateur direction en base en collaborator s\'il ne réapparaît plus dans le groupe direction (les groupes écrasent toujours le rôle)', async () => {
      // La méthode ne lit jamais le rôle existant en base : le résultat ne
      // dépend que des groupes actuellement présents dans le token.
      await sync([]);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'collaborator', isItStaff: false },
      });
    });
  });
});
