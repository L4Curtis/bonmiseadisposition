import type { Request, Response } from 'express';
import { AuthController, isSafeReturnTo } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import { adminUser } from '../../common/__tests__/fixtures/user.fixtures';
import type { Mock } from 'vitest';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    revokeToken: Mock;
    revokeRefreshToken: Mock;
    clearAuthCookies: Mock;
    setAuthCookies: Mock;
    localLogin: Mock;
    createTokensForUser: Mock;
  };
  let prisma: ReturnType<typeof createMockPrismaService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    authService = {
      revokeToken: vi.fn(),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
      clearAuthCookies: vi.fn(),
      setAuthCookies: vi.fn(),
      localLogin: vi.fn(),
      createTokensForUser: vi.fn(),
    };
    prisma = createMockPrismaService();
    configService = createMockConfigService();
    controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as AppConfigService,
      prisma as unknown as PrismaService,
    );
  });

  function makeRes(): Response {
    return { json: vi.fn().mockReturnThis() } as unknown as Response;
  }

  describe('logout', () => {
    it('revokes the refresh token when the refresh_token cookie is present (LOT C bug #3)', async () => {
      const req = {
        cookies: { access_token: 'at-value', refresh_token: 'rt-value' },
        headers: { 'user-agent': 'jest' },
      } as unknown as Request;
      const res = makeRes();

      await controller.logout(adminUser() as never, req, res);

      expect(authService.revokeToken).toHaveBeenCalledWith('at-value');
      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('rt-value');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'logout' }) }),
      );
      expect(authService.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('does not attempt revocation when no refresh_token cookie is present', async () => {
      const req = { cookies: {}, headers: {} } as unknown as Request;
      const res = makeRes();

      await controller.logout(adminUser() as never, req, res);

      expect(authService.revokeToken).not.toHaveBeenCalled();
      expect(authService.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('localLogin', () => {
    it('passes the extracted client IP through to authService.localLogin', async () => {
      configService.set('general', 'local_auth_enabled', 'true');
      authService.localLogin.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        mustChangePassword: false,
      });
      const req = {
        headers: { 'x-real-ip': '203.0.113.5', 'user-agent': 'jest' },
        socket: {},
      } as unknown as Request;
      const res = makeRes();

      await controller.localLogin({ email: 'User@Example.com', password: 'x' }, req, res);

      expect(authService.localLogin).toHaveBeenCalledWith('User@Example.com', 'x', '203.0.113.5');
      // Audit entries use the normalized email so they line up with checkBruteForce()
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userEmail: 'user@example.com' }) }),
      );
    });
  });

  describe('isSafeReturnTo (open-redirect hardening)', () => {
    const frontendUrl = 'http://localhost:5173';

    it('accepts a plain relative path on the same origin', () => {
      expect(isSafeReturnTo('/dashboard', frontendUrl)).toBe(true);
    });

    it('rejects the classic protocol-relative double-slash vector', () => {
      expect(isSafeReturnTo('//evil.com', frontendUrl)).toBe(false);
    });

    it('rejects a backslash vector ("/\\evil.com") — falls back to "/"', () => {
      expect(isSafeReturnTo('/\\evil.com', frontendUrl)).toBe(false);
    });

    it('rejects a tab control-character vector ("/%09/evil.com" decoded) — falls back to "/"', () => {
      // %09 decodes to a raw tab (0x09) before the string reaches isSafeReturnTo
      expect(isSafeReturnTo('/\t/evil.com', frontendUrl)).toBe(false);
    });

    it('rejects a newline control-character vector ("/%0a/evil.com" decoded) — falls back to "/"', () => {
      expect(isSafeReturnTo('/\n/evil.com', frontendUrl)).toBe(false);
    });

    it('rejects a value that does not start with "/"', () => {
      expect(isSafeReturnTo('evil.com', frontendUrl)).toBe(false);
    });

    it('rejects an undefined returnTo', () => {
      expect(isSafeReturnTo(undefined, frontendUrl)).toBe(false);
    });
  });
});
