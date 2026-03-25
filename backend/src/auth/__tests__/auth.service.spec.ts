import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { localAdminUser, collaboratorUser } from '../../common/__tests__/fixtures/user.fixtures';

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

    // JWT_SECRET must be set for the service to function
    process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';

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

  describe('localLogin', () => {
    it('should authenticate valid local user', async () => {
      const password = STRONG_PASSWORD;
      const hash = await bcrypt.hash(password, 10);
      const user = {
        ...localAdminUser(),
        passwordHash: hash,
        mustChangePassword: false,
      };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      const result = await service.localLogin(user.email, password);

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
        mustChangePassword: false,
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: user.email, isLocalAccount: true, active: true },
      });
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('CorrectPassword1!', 10);
      const user = { ...localAdminUser(), passwordHash: hash };

      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(user);

      await expect(
        service.localLogin(user.email, 'WrongPassword1!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.localLogin('nobody@local', 'Whatever1!@#'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when brute-force locked (10+ failures)', async () => {
      prisma.auditLog.count.mockResolvedValue(10);

      await expect(
        service.localLogin('locked@local', 'Whatever1!@#'),
      ).rejects.toThrow(UnauthorizedException);

      // Should NOT even try to look up the user
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
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
  });
});
