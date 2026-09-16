import { Injectable, UnauthorizedException, BadRequestException, ServiceUnavailableException, ConflictException, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response, Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import { Prisma, UserRole } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './utils/normalize-email.util';
import { computeMustChangePassword } from './password-policy';

/** Thrown when an account is locked by brute-force protection — the controller
 *  logs it as login_local_locked (NOT login_local_failed) so that lockout
 *  attempts do not extend the lockout window indefinitely. */
export class AccountLockedException extends UnauthorizedException {}

/** Thrown when creating a new SSO-provisioned user hits a residual unique
 *  constraint violation — the controller redirects to a distinct error code
 *  (account_conflict) instead of the generic auth_failed (LOT C bug #4). */
export class AccountConflictException extends ConflictException {}

interface RefreshTokenPayload {
  sub: string;
  type: string;
  authTime?: number;
  iat?: number;
}

// Absolute session lifetime: refresh rotation cannot extend a session past this.
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

const ADMIN_LOCAL_EMAIL = normalizeEmail('admin@local');

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

  async getLoginUrl(state: string, prompt?: string): Promise<{ url: string; codeVerifier: string }> {
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
      // Seule la valeur 'select_account' est acceptée depuis la requête HTTP
      // (liste blanche) — force l'écran de sélection de compte Microsoft au
      // lieu du SSO silencieux, utile pour changer de compte sans se déconnecter
      // de Windows/Microsoft 365.
      ...(prompt === 'select_account' ? { prompt: 'select_account' } : {}),
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

    const email = normalizeEmail(response.account.username);
    const displayName = response.account.name || email;

    // Recherche insensible à la casse : SSO et LDAP peuvent renvoyer la même
    // adresse avec une casse différente (LOT C bug #6) — findUnique({email})
    // sur la colonne (sensible à la casse) créerait un doublon et finirait en
    // P2002 sur la contrainte unique, ou pire, deux identités pour la même
    // personne.
    let user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (user) {
      const updateData: Prisma.UserUpdateInput = {};
      if (user.email !== email) updateData.email = email;
      if (!user.displayName) updateData.displayName = displayName;
      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: updateData });
      }
    } else {
      // Create minimal user record — LDAP sync will enrich it later.
      // samAccountName = email normalisé complet (unique par construction,
      // comme la colonne email elle-même) — PAS la partie locale
      // (email.split('@')[0]) : celle-ci peut entrer en collision avec un
      // sAMAccountName LDAP existant pour une personne différente (ex. LDAP
      // "jdupont" vs SSO "jdupont@domaine.fr"), ce qui faisait échouer la
      // création avec un P2002 remonté comme un auth_failed générique
      // (LOT C bug #4).
      try {
        user = await this.prisma.user.create({
          data: {
            samAccountName: email,
            displayName,
            email,
            role: 'collaborator',
            active: true,
          },
        });
      } catch (err: unknown) {
        const isUniqueConstraintViolation =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isUniqueConstraintViolation) {
          // Résiduel : création concurrente (deux callbacks SSO simultanés
          // pour le même utilisateur) ou collision imprévue. Le contrôleur
          // distingue ce cas (error=account_conflict) de l'échec générique.
          this.logger.warn(`SSO ${email}: création en conflit (P2002 résiduel) — probable création concurrente`);
          throw new AccountConflictException('Conflit lors de la création du compte SSO');
        }
        throw err;
      }
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

    // ── Phase 1 : validité PURE du jeton (signature/type/session absolue) —
    // aucun accès DB ici. Toute erreur est un problème d'authentification
    // légitime → 401. isRefreshTokenRevoked() (accès DB) est volontairement
    // exclu de cette phase : une panne DB ne doit pas se traduire par un 401
    // (cf. phase 2) — voir LOT C bug #2 (relecture).
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, { secret: jwtSecret, algorithms: ['HS256'] });
      if (payload.type !== 'refresh') throw new UnauthorizedException();

      // Absolute session lifetime: rotation cannot extend a session forever
      const authTime: number | undefined = payload.authTime ?? payload.iat;
      if (authTime && Date.now() - authTime * 1000 > MAX_SESSION_MS) {
        throw new UnauthorizedException('Session expirée — reconnexion requise');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Erreurs jsonwebtoken (signature invalide, expiré, malformé...)
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // ── Phase 2 : persistance (DB) — une erreur inattendue ici (Prisma,
    // connexion DB...) n'est PAS un problème d'authentification : la
    // remonter en 401 laisserait croire à l'utilisateur qu'il doit se
    // reconnecter alors que le service est simplement indisponible.
    // Exception : un P2025 sur findUniqueOrThrow (utilisateur supprimé)
    // reste un vrai 401 — ce n'est pas une panne, le compte n'existe plus.
    try {
      const authTime: number | undefined = payload.authTime ?? payload.iat;

      if (await this.isRefreshTokenRevoked(refreshToken)) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      // Revoke old refresh token (8h TTL to match refresh token lifetime)
      await this.revokeRefreshToken(refreshToken);

      let user: { id: string; email: string; role: string; active: boolean; passwordChangedAt: Date | null };
      try {
        user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      } catch (err: unknown) {
        const isRecordNotFound = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
        if (isRecordNotFound) {
          throw new UnauthorizedException('Utilisateur introuvable');
        }
        throw err;
      }
      if (!user.active) {
        throw new UnauthorizedException('Account is inactive');
      }
      // Tokens issued before the last password change are no longer valid
      if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 2000) {
        throw new UnauthorizedException('Session invalidée par un changement de mot de passe');
      }

      return await this.createTokensForUser(user, authTime);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `refreshAccessToken: échec inattendu (DB ?) après validation du jeton: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException('Service temporairement indisponible, réessayez.');
    }
  }

  /**
   * Recalcule le rôle depuis les groupes Entra à CHAQUE connexion SSO — les
   * groupes font toujours foi, sans exception : un compte passé manuellement
   * en `direction` (PATCH /admin/users/:id/role) redescend en `collaborator`
   * à sa prochaine connexion s'il n'appartient à aucun groupe élevé. Priorité
   * admin > technician > direction > collaborator ; `direction` n'est jamais
   * du personnel IT (`isItStaff = false`).
   */
  private async syncUserRoleFromGroups(userId: string, groups: string[]): Promise<void> {
    const adminGroup = await this.configService.get('entra', 'admin_group_id');
    const techGroup = await this.configService.get('entra', 'technician_group_id');
    const directionGroup = await this.configService.get('entra', 'direction_group_id');

    let role: UserRole = 'collaborator';
    let isItStaff = false;

    if (adminGroup && groups.includes(adminGroup)) {
      role = 'admin';
      isItStaff = true;
    } else if (techGroup && groups.includes(techGroup)) {
      role = 'technician';
      isItStaff = true;
    } else if (directionGroup && groups.includes(directionGroup)) {
      role = 'direction';
      isItStaff = false;
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
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required. Generate with: openssl rand -hex 32');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long. Generate with: openssl rand -hex 32');
    }
    return secret;
  }

  async localLogin(email: string, password: string, ip: string): Promise<{ accessToken: string; refreshToken: string; mustChangePassword: boolean }> {
    const normalizedEmail = normalizeEmail(email);
    // Check brute-force lock (persistent, survives restarts)
    await this.checkBruteForce(normalizedEmail, ip);

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, isLocalAccount: true, active: true },
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
    return { ...tokens, mustChangePassword: computeMustChangePassword(user) };
  }

  // ─── Brute-force protection (persistent via AuditLog, survives restarts) ─
  // Deux dimensions indépendantes (LOT C bug #2) :
  //  - verrou par COMPTE : ≥10 échecs pour (email, IP) en 30 min. Sans la
  //    dimension IP, n'importe qui pouvait verrouiller admin@local (compte de
  //    secours) depuis n'importe où en renvoyant juste le bon email.
  //  - verrou par IP : ≥30 échecs depuis une même IP en 30 min, toutes cibles
  //    confondues — bloque le credential-stuffing qui teste beaucoup d'emails
  //    différents depuis une seule IP (ce que le verrou par compte ne couvre pas).
  // Failed login audit entries are recorded by the controller after this check;
  // lockout rejections are logged as login_local_locked (not counted here) so
  // that probing a locked account cannot extend the lockout indefinitely.
  private async checkBruteForce(email: string, ip: string): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000); // 30-min window
    const [accountFailures, ipFailures] = await Promise.all([
      this.prisma.auditLog.count({
        where: { userEmail: email, ipAddress: ip, action: 'login_local_failed', createdAt: { gte: windowStart } },
      }),
      this.prisma.auditLog.count({
        where: { ipAddress: ip, action: 'login_local_failed', createdAt: { gte: windowStart } },
      }),
    ]);
    if (accountFailures >= 10) {
      this.logger.warn(`Compte ${email} bloqué depuis l'IP ${ip} (${accountFailures} échecs en 30 min)`);
      throw new AccountLockedException('Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans 30 minutes.');
    }
    if (ipFailures >= 30) {
      this.logger.warn(`IP ${ip} bloquée (${ipFailures} échecs toutes cibles confondues en 30 min)`);
      throw new AccountLockedException('Trop de tentatives depuis votre adresse. Réessayez dans 30 minutes.');
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

    // Le mot de passe temporaire écrit sur disque au provisioning n'a plus de
    // raison d'exister une fois que admin@local a changé son mot de passe.
    if (user.email === ADMIN_LOCAL_EMAIL) {
      this.deleteInitialAdminPasswordFile();
    }
  }

  /** Supprime data/initial-admin-password.txt après le premier changement de
   *  mot de passe réussi de admin@local — le fichier ne doit pas traîner
   *  indéfiniment sur le disque une fois le mot de passe temporaire consommé. */
  private deleteInitialAdminPasswordFile(): void {
    const filePath = join(process.cwd(), 'data', 'initial-admin-password.txt');
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        this.logger.log(`${filePath} supprimé après changement du mot de passe admin@local`);
      }
    } catch (err) {
      this.logger.error(`Impossible de supprimer ${filePath}: ${(err as Error).message}`);
    }
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

    const existing = await this.prisma.user.findUnique({ where: { email: ADMIN_LOCAL_EMAIL } });

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
          email: ADMIN_LOCAL_EMAIL,
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
    } catch (err: unknown) {
      // Ne jamais avaler autre chose qu'une violation de contrainte unique
      // (l'admin a été créé entre-temps, p. ex. démarrages concurrents) —
      // toute autre erreur (DB indisponible, schéma invalide...) doit être
      // visible et relancée, pas masquée derrière un warn générique.
      const isAlreadyExists = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isAlreadyExists) {
        this.logger.warn('Could not create default local admin (already exists)');
        return;
      }
      this.logger.error(
        `ensureDefaultAdmin: création de l'admin par défaut a échoué: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }
}
