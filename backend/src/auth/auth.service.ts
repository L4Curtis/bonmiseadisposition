import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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

  async getLoginUrl(state: string): Promise<string> {
    const msalClient = await this.getMsalClient();
    const redirectUri = await this.configService.get('entra', 'redirect_uri');

    const url = await msalClient.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: redirectUri || 'http://localhost:4000/api/auth/callback',
      state,
      responseMode: 'query',
    });

    return url;
  }

  async handleCallback(code: string, state: string): Promise<{ accessToken: string; refreshToken: string }> {
    const msalClient = await this.getMsalClient();
    const redirectUri = await this.configService.get('entra', 'redirect_uri');

    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: redirectUri || 'http://localhost:4000/api/auth/callback',
      state,
    };

    const response = await msalClient.acquireTokenByCode(tokenRequest);

    if (!response || !response.account) {
      throw new UnauthorizedException('Failed to authenticate with Microsoft');
    }

    const email = response.account.username;
    const displayName = response.account.name || email;

    // Find or create user in DB
    let user = await this.prisma.user.findFirst({ where: { email } });

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

    // Check group membership for role elevation
    const groups: string[] = (response.idTokenClaims as any)?.groups || [];
    await this.syncUserRoleFromGroups(user.id, groups);

    // Re-fetch with updated role
    user = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const jwtSecret = this.getJwtSecret();
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { secret: jwtSecret, expiresIn: '8h' },
    );

    return { accessToken, refreshToken };
  }

  async createTokensForUser(user: { id: string; email: string; role: string }): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.getJwtSecret();
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '15m' });
    const refreshToken = this.jwtService.sign({ sub: user.id, type: 'refresh' }, { secret: jwtSecret, expiresIn: '8h' });
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const jwtSecret = this.getJwtSecret();

    try {
      const payload = this.jwtService.verify(refreshToken, { secret: jwtSecret });
      if (payload.type !== 'refresh') throw new UnauthorizedException();

      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      const newPayload = { sub: user.id, email: user.email, role: user.role };

      return this.jwtService.sign(newPayload, { secret: jwtSecret, expiresIn: '15m' });
    } catch {
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
    return secret;
  }

  async localLogin(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; mustChangePassword: boolean }> {
    // Check brute-force lock (persistent, survives restarts)
    await this.checkBruteForce(email);

    const user = await this.prisma.user.findFirst({
      where: { email, isLocalAccount: true, active: true },
    });

    if (!user || !user.passwordHash) {
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
  // Failed login audit entries are recorded by the controller after this check.
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
      throw new UnauthorizedException(`Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans 30 minutes.`);
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
      data: { passwordHash: hash, mustChangePassword: false },
    });
  }

  async ensureDefaultAdmin(): Promise<void> {
    // Ensure local_auth_enabled defaults to true
    const localAuthSetting = await this.configService.get('general', 'local_auth_enabled');
    if (localAuthSetting === null || localAuthSetting === undefined || localAuthSetting === '') {
      await this.configService.set('general', 'local_auth_enabled', 'true');
    }

    const existing = await this.prisma.user.findFirst({ where: { email: 'admin@local' } });

    if (existing) {
      // Admin exists — do NOT reset the password (avoid reverting a custom password on restart)
      if (!existing.isLocalAccount) {
        const hash = await bcrypt.hash('admin', 12);
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { isLocalAccount: true, passwordHash: hash, role: 'admin', isItStaff: true, mustChangePassword: true },
        });
        this.logger.log('Default local admin upgraded: admin@local (changement de mot de passe requis)');
      }
      return;
    }

    // Create default admin with must-change-password flag
    const hash = await bcrypt.hash('admin', 12);
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
      this.logger.log('Default local admin created: admin@local — password change required on first login');
    } catch {
      this.logger.warn('Could not create default local admin (already exists)');
    }
  }
}
