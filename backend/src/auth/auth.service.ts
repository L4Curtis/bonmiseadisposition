import { Injectable, UnauthorizedException, BadRequestException, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

/** Thrown when an account is locked by brute-force protection — the controller
 *  logs it as login_local_locked (NOT login_local_failed) so that lockout
 *  attempts do not extend the lockout window indefinitely. */
export class AccountLockedException extends UnauthorizedException {}

// Absolute session lifetime: refresh rotation cannot extend a session past this.
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

// Pre-computed hash to equalize timing between "unknown user" and "wrong password"
// (prevents user enumeration through bcrypt timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-dummy-password', 12);

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);

  // In-memory blacklist for revoked JWT tokens (token hash → expiry timestamp).
  // Refresh-token revocations are additionally persisted in DB (revoked_tokens)
  // so that logout and rotation-replay detection survive restarts.
  private readonly revokedTokens = new Map<string, number>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    // Periodically clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupRevokedTokens().catch((err) =>
        this.logger.error(`Nettoyage des tokens révoqués échoué: ${(err as Error).message}`),
      );
    }, 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Revoke an access token (in-memory only — 15 min max exposure) */
  revokeToken(token: string, ttlMs: number = 15 * 60 * 1000): void {
    if (this.revokedTokens.size >= 10000) {
      void this.cleanupRevokedTokens();
    }
    this.revokedTokens.set(this.hashToken(token), Date.now() + ttlMs);
  }

  /** Revoke a refresh token: in-memory + persisted in DB (survives restarts) */
  async revokeRefreshToken(token: string, ttlMs: number = 8 * 60 * 60 * 1000): Promise<void> {
    const hash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlMs);
    this.revokedTokens.set(hash, expiresAt.getTime());
    try {
      await this.prisma.revokedToken.upsert({
        where: { tokenHash: hash },
        update: { expiresAt },
        create: { tokenHash: hash, expiresAt },
      });
    } catch (err) {
      this.logger.error(`Persistance de la révocation échouée: ${(err as Error).message}`);
    }
  }

  /** Check if a token has been revoked (in-memory fast path) */
  isTokenRevoked(token: string): boolean {
    return this.revokedTokens.has(this.hashToken(token));
  }

  /** Check revocation for refresh tokens: memory first, then persistent store */
  async isRefreshTokenRevoked(token: string): Promise<boolean> {
    const hash = this.hashToken(token);
    if (this.revokedTokens.has(hash)) return true;
    const record = await this.prisma.revokedToken.findUnique({ where: { tokenHash: hash } });
    return !!record && record.expiresAt.getTime() > Date.now();
  }

  private async cleanupRevokedTokens(): Promise<void> {
    const now = Date.now();
    for (const [hash, expiresAt] of this.revokedTokens) {
      if (expiresAt <= now) {
        this.revokedTokens.delete(hash);
      }
    }
    await this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  }

  /** Build MSAL ConfidentialClientApplication from DB config */
  private async getMsalClient(): Promise<ConfidentialClientApplication> {
    const tenantId = await this.configService.get('entra', 'tenant_id');
    const clientId = await this.configService.get('entra', 'client_id');
    const clientSecret = await this.configService.get('entra', 'client_secret');

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Entra ID configuration incomplete. Please configure in admin panel.');
    }

    return new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });
  }

  /** Redirect URI Entra : valeur explicite si configurée, sinon dérivée
   *  automatiquement de l'URL publique (general.app_url puis FRONTEND_URL) —
   *  plus besoin de la saisir à la main dans la majorité des déploiements. */
  private async getRedirectUri(): Promise<string> {
    const explicit = await this.configService.get('entra', 'redirect_uri');
    if (explicit) return explicit;
    const appUrl = (await this.configService.get('general', 'app_url')) || process.env.FRONTEND_URL;
    if (appUrl) return `${appUrl.replace(/\/+$/, '')}/api/auth/callback`;
    return 'http://localhost:4000/api/auth/callback';
  }

  async getLoginUrl(state: string): Promise<{ url: string; codeVerifier: string }> {
    const msalClient = await this.getMsalClient();
    const redirectUri = await this.getRedirectUri();

    // PKCE: generate code verifier and challenge (RFC 7636)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const url = await msalClient.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
      state,
      responseMode: 'query',
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    return { url, codeVerifier };
  }

  async handleCallback(code: string, state: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }> {
    const msalClient = await this.getMsalClient();
    const redirectUri = await this.getRedirectUri();

    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
      state,
      codeVerifier,
    };

    const response = await msalClient.acquireTokenByCode(tokenRequest);

    if (!response || !response.account) {
      throw new UnauthorizedException('Failed to authenticate with Microsoft');
    }

    const email = response.account.username;
    const displayName = response.account.name || email;

    // Find or create user in DB (email has unique constraint)
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create minimal user record — LDAP sync will enrich it later
      user = await this.prisma.user.create({
        data: {
          samAccountName: email.split('@')[0],
          displayName,
          email,
          role: 'collaborator',
          active: true,
        },
      });
    }

    // Offboarded accounts must not get a session even if Entra still authenticates them
    if (!user.active) {
      throw new UnauthorizedException('Compte désactivé');
    }

    // Check group membership for role elevation. When the groups claim is absent
    // (claim not configured, or Entra "group overage" replaces it with
    // _claim_names/_claim_sources), DO NOT downgrade the existing role.
    interface IdTokenClaimsWithGroups {
      groups?: string[];
    }
    const groups = (response.idTokenClaims as IdTokenClaimsWithGroups)?.groups;
    if (groups === undefined) {
      this.logger.warn(
        `SSO ${email}: claim "groups" absente du id_token (claim non configurée ou group overage) — rôle existant conservé`,
      );
    } else {
      await this.syncUserRoleFromGroups(user.id, groups);
    }

    // Re-fetch with updated role
    user = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    return { ...(await this.createTokensForUser(user)), user: { id: user.id, email: user.email } };
  }

  async createTokensForUser(
    user: { id: string; email: string; role: string },
    authTime?: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.getJwtSecret();
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '15m' });
    // authTime = epoch seconds of the ORIGINAL login, carried across rotations
    // to enforce an absolute session lifetime.
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', authTime: authTime ?? Math.floor(Date.now() / 1000) },
      { secret: jwtSecret, expiresIn: '8h' },
    );
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.getJwtSecret();

    try {
      // Check if the refresh token has been revoked (rotation replay detection)
      if (await this.isRefreshTokenRevoked(refreshToken)) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const payload = this.jwtService.verify(refreshToken, { secret: jwtSecret, algorithms: ['HS256'] });
      if (payload.type !== 'refresh') throw new UnauthorizedException();

      // Absolute session lifetime: rotation cannot extend a session forever
      const authTime: number = payload.authTime ?? payload.iat;
      if (authTime && Date.now() - authTime * 1000 > MAX_SESSION_MS) {
        throw new UnauthorizedException('Session expirée — reconnexion requise');
      }

      // Revoke old refresh token (8h TTL to match refresh token lifetime)
      await this.revokeRefreshToken(refreshToken);

      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      if (!user.active) {
        throw new UnauthorizedException('Account is inactive');
      }
      // Tokens issued before the last password change are no longer valid
      if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 2000) {
        throw new UnauthorizedException('Session invalidée par un changement de mot de passe');
      }

      return this.createTokensForUser(user, authTime);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async syncUserRoleFromGroups(userId: string, groups: string[]) {
    const adminGroup = await this.configService.get('entra', 'admin_group_id');
    const techGroup = await this.configService.get('entra', 'technician_group_id');

    let role: 'admin' | 'technician' | 'collaborator' = 'collaborator';
    let isItStaff = false;

    if (adminGroup && groups.includes(adminGroup)) {
      role = 'admin';
      isItStaff = true;
    } else if (techGroup && groups.includes(techGroup)) {
      role = 'technician';
      isItStaff = true;
    }
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
      path: '/api/auth/refresh',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie('access_token', { path: '/api' });
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
  }

  getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required. Generate with: openssl rand -hex 32');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long. Generate with: openssl rand -hex 32');
    }
    return secret;
  }

  async localLogin(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; mustChangePassword: boolean }> {
    // Check brute-force lock (persistent, survives restarts)
    await this.checkBruteForce(email);

    const user = await this.prisma.user.findFirst({
      where: { email, isLocalAccount: true, active: true },
    });

    if (!user || !user.passwordHash) {
      // Equalize timing with the existing-user path (anti user-enumeration)
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Identifiants incorrects');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants incorrects');
    }

    const tokens = await this.createTokensForUser(user);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  // ─── Brute-force protection (persistent via AuditLog, survives restarts) ─
  // Counts login_local_failed entries in the last 30 minutes for a given email.
  // Failed login audit entries are recorded by the controller after this check;
  // lockout rejections are logged as login_local_locked (not counted here) so
  // that probing a locked account cannot extend the lockout indefinitely.
  private async checkBruteForce(email: string): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000); // 30-min window
    const recentFailures = await this.prisma.auditLog.count({
      where: {
        userEmail: email,
        action: 'login_local_failed',
        createdAt: { gte: windowStart },
      },
    });
    if (recentFailures >= 10) {
      this.logger.warn(`Compte ${email} bloqué (${recentFailures} échecs en 30 min)`);
      throw new AccountLockedException(`Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans 30 minutes.`);
    }
  }

  private validatePasswordStrength(password: string): void {
    if (password.length > 128) {
      throw new BadRequestException('Le mot de passe ne doit pas dépasser 128 caractères');
    }
    if (password.length < 12) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 12 caractères');
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException('Le mot de passe doit contenir au moins une lettre majuscule');
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestException('Le mot de passe doit contenir au moins une lettre minuscule');
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestException('Le mot de passe doit contenir au moins un chiffre');
    }
    if (!/[@$!%*?&_#^+=\-.]/.test(password)) {
      throw new BadRequestException('Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&_#^+=−.)');
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.isLocalAccount || !user.passwordHash) {
      throw new UnauthorizedException('Ce compte ne supporte pas la modification de mot de passe local');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    this.validatePasswordStrength(newPassword);

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
  }

  private generateDefaultAdminPassword(): string {
    return process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
  }

  /** Write the generated admin password to a restricted file instead of logging
   *  it in clear text (container logs persist and are widely readable). */
  private persistInitialAdminPassword(tempPassword: string): void {
    const filePath = join(process.cwd(), 'data', 'initial-admin-password.txt');
    try {
      writeFileSync(filePath, `admin@local : ${tempPassword}\n`, { encoding: 'utf8', mode: 0o600 });
      this.logger.warn(
        `Default local admin: admin@local — mot de passe temporaire écrit dans ${filePath} (changement requis au premier login). Supprimez ce fichier après récupération.`,
      );
    } catch (err) {
      // Fallback: file system unavailable — log it (better than a silent lockout)
      this.logger.error(`Impossible d'écrire ${filePath}: ${(err as Error).message}`);
      this.logger.warn(`Default local admin: admin@local — temporary password: ${tempPassword}`);
    }
  }

  async ensureDefaultAdmin(): Promise<void> {
    // Ensure local_auth_enabled defaults to true
    const localAuthSetting = await this.configService.get('general', 'local_auth_enabled');
    if (localAuthSetting === null || localAuthSetting === undefined || localAuthSetting === '') {
      await this.configService.set('general', 'local_auth_enabled', 'true');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: 'admin@local' } });

    if (existing) {
      // Admin exists — do NOT reset the password (avoid reverting a custom password on restart)
      if (!existing.isLocalAccount) {
        const tempPassword = this.generateDefaultAdminPassword();
        const hash = await bcrypt.hash(tempPassword, 12);
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { isLocalAccount: true, passwordHash: hash, role: 'admin', isItStaff: true, mustChangePassword: true },
        });
        if (process.env.DEFAULT_ADMIN_PASSWORD) {
          this.logger.warn('Default local admin upgraded: admin@local (mot de passe = DEFAULT_ADMIN_PASSWORD, changement requis au premier login)');
        } else {
          this.persistInitialAdminPassword(tempPassword);
        }
      }
      return;
    }

    // Create default admin with must-change-password flag
    const tempPassword = this.generateDefaultAdminPassword();
    const hash = await bcrypt.hash(tempPassword, 12);
    try {
      await this.prisma.user.create({
        data: {
          samAccountName: 'admin_local',
          displayName: 'Administrateur local',
          email: 'admin@local',
          role: 'admin',
          isItStaff: true,
          isLocalAccount: true,
          passwordHash: hash,
          mustChangePassword: true,
          active: true,
        },
      });
      if (process.env.DEFAULT_ADMIN_PASSWORD) {
        this.logger.warn('Default local admin created: admin@local (mot de passe = DEFAULT_ADMIN_PASSWORD, changement requis au premier login)');
      } else {
        this.persistInitialAdminPassword(tempPassword);
      }
    } catch {
      this.logger.warn('Could not create default local admin (already exists)');
    }
  }
}
