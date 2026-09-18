import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLockedException, AccountConflictException } from './exceptions';
import { resolveRoleFromGroups } from './role-mapping';
import {
  RevokedTokenStore,
  isTokenRevoked as isTokenRevokedImpl,
  isRefreshTokenRevoked as isRefreshTokenRevokedImpl,
  revokeToken as revokeTokenImpl,
  revokeRefreshToken as revokeRefreshTokenImpl,
  cleanupRevokedTokens as cleanupRevokedTokensImpl,
} from './token-revocation';
import {
  resolveJwtSecret,
  createTokensForUser as createTokensForUserImpl,
  refreshAccessToken as refreshAccessTokenImpl,
} from './session-tokens';
import { getLoginUrl as getLoginUrlImpl, handleCallback as handleCallbackImpl } from './entra-sso';
import { localLogin as localLoginImpl } from './local-login';
import { changePassword as changePasswordImpl } from './change-password';
import { ensureDefaultAdmin as ensureDefaultAdminImpl } from './admin-provisioning';

// Ré-exportées telles quelles : auth.controller.ts les importe depuis
// './auth.service' — ce chemin ne doit pas changer (refactor iso-fonctionnel).
export { AccountLockedException, AccountConflictException };

/**
 * Façade fine : chaque méthode publique délègue à un module dédié sous
 * `auth/` (token-revocation, session-tokens, entra-sso, local-login,
 * change-password, admin-provisioning, role-mapping). Aucun changement de
 * comportement — seule l'implémentation est répartie entre modules.
 *
 * `revokedTokens`/`cleanupInterval` restent une propriété d'instance : c'est
 * l'état vivant du cache de révocation, partagé (par référence) avec les
 * fonctions de token-revocation.ts et session-tokens.ts.
 */
@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);

  // In-memory blacklist for revoked JWT tokens (token hash → expiry timestamp).
  // Refresh-token revocations are additionally persisted in DB (revoked_tokens)
  // so that logout and rotation-replay detection survive restarts.
  private readonly revokedTokens: RevokedTokenStore = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    // Periodically clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      cleanupRevokedTokensImpl({ prisma: this.prisma }, this.revokedTokens).catch((err) =>
        this.logger.error(`Nettoyage des tokens révoqués échoué: ${(err as Error).message}`),
      );
    }, 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  /** Revoke an access token (in-memory only — 15 min max exposure) */
  revokeToken(token: string, ttlMs: number = 15 * 60 * 1000): void {
    revokeTokenImpl(this.revokedTokens, token, ttlMs, () => {
      // Purge opportuniste : son échec (base indisponible) ne doit pas remonter
      // en rejet non capturé et faire tomber le processus.
      cleanupRevokedTokensImpl({ prisma: this.prisma }, this.revokedTokens).catch((err) =>
        this.logger.warn(`Purge des jetons révoqués en échec : ${(err as Error).message}`),
      );
    });
  }

  /** Revoke a refresh token: in-memory + persisted in DB (survives restarts) */
  async revokeRefreshToken(token: string, ttlMs: number = 8 * 60 * 60 * 1000): Promise<void> {
    return revokeRefreshTokenImpl({ prisma: this.prisma, logger: this.logger }, this.revokedTokens, token, ttlMs);
  }

  /** Check if a token has been revoked (in-memory fast path) */
  isTokenRevoked(token: string): boolean {
    return isTokenRevokedImpl(this.revokedTokens, token);
  }

  /** Check revocation for refresh tokens: memory first, then persistent store */
  async isRefreshTokenRevoked(token: string): Promise<boolean> {
    return isRefreshTokenRevokedImpl({ prisma: this.prisma }, this.revokedTokens, token);
  }

  async getLoginUrl(state: string, prompt?: string): Promise<{ url: string; codeVerifier: string }> {
    return getLoginUrlImpl({ configService: this.configService }, state, prompt);
  }

  async handleCallback(
    code: string,
    state: string,
    codeVerifier: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }> {
    return handleCallbackImpl(
      {
        configService: this.configService,
        prisma: this.prisma,
        logger: this.logger,
        createTokens: (user) => this.createTokensForUser(user),
        syncRoleFromGroups: (userId, groups) => this.syncUserRoleFromGroups(userId, groups),
      },
      code,
      state,
      codeVerifier,
    );
  }

  async createTokensForUser(
    user: { id: string; email: string; role: string },
    authTime?: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return createTokensForUserImpl({ jwtService: this.jwtService, getJwtSecret: () => this.getJwtSecret() }, user, authTime);
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    return refreshAccessTokenImpl(
      {
        jwtService: this.jwtService,
        prisma: this.prisma,
        logger: this.logger,
        store: this.revokedTokens,
        getJwtSecret: () => this.getJwtSecret(),
      },
      refreshToken,
    );
  }

  /**
   * Recalcule le rôle depuis les groupes Entra à CHAQUE connexion SSO — les
   * groupes font toujours foi, sans exception : un compte passé manuellement
   * en `direction` (PATCH /admin/users/:id/role) redescend en `collaborator`
   * à sa prochaine connexion s'il n'appartient à aucun groupe élevé. Priorité
   * admin > technician > direction > collaborator ; `direction` n'est jamais
   * du personnel IT (`isItStaff = false`). Mapping délégué à role-mapping.ts
   * (fonction pure), seule la lecture config + l'écriture DB restent ici.
   */
  private async syncUserRoleFromGroups(userId: string, groups: string[]): Promise<void> {
    const adminGroupId = await this.configService.get('entra', 'admin_group_id');
    const technicianGroupId = await this.configService.get('entra', 'technician_group_id');
    const directionGroupId = await this.configService.get('entra', 'direction_group_id');

    const { role, isItStaff } = resolveRoleFromGroups(groups, { adminGroupId, technicianGroupId, directionGroupId });
    await this.prisma.user.update({
      where: { id: userId },
      data: { role, isItStaff },
    });
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 min
      path: '/api', // Limit cookie scope to API routes
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8h
      // Path '/api/auth' (et non '/api/auth/refresh') : le cookie doit aussi
      // être envoyé sur POST /api/auth/logout, sinon le navigateur ne
      // l'inclut jamais sur cette route et le refresh token n'est jamais
      // révoqué à la déconnexion (LOT C bug #3).
      path: '/api/auth',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie('access_token', { path: '/api' });
    res.clearCookie('refresh_token', { path: '/api/auth' });
  }

  getJwtSecret(): string {
    return resolveJwtSecret(process.env.JWT_SECRET);
  }

  async localLogin(
    email: string,
    password: string,
    ip: string,
  ): Promise<{ accessToken: string; refreshToken: string; mustChangePassword: boolean }> {
    return localLoginImpl(
      { prisma: this.prisma, logger: this.logger, createTokens: (user) => this.createTokensForUser(user) },
      email,
      password,
      ip,
    );
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    return changePasswordImpl({ prisma: this.prisma, logger: this.logger }, userId, currentPassword, newPassword);
  }

  async ensureDefaultAdmin(): Promise<void> {
    return ensureDefaultAdminImpl({ prisma: this.prisma, configService: this.configService, logger: this.logger });
  }
}
