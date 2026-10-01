import { Controller, Get, Query, Req, Res, Post, Body, UseGuards, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AuthService, AccountLockedException, AccountConflictException } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { Roles, ALL_ROLES } from './decorators/roles.decorator';
import { normalizeEmail } from './utils/normalize-email.util';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './auth-user.interface';
import { AppConfigService } from '../config/config.service';
import { ConfigRegistryService } from '../config/config-registry.service';
import { AuditService } from '../audit/audit.service';
import type { AuditEntryInput } from '../audit/audit-record';
import { LocalLoginDto } from './dto/local-login.dto';
import { clientIp } from '../common/http/client-ip';
import { ChangePasswordDto } from './dto/change-password.dto';


/** Au-delà, un « returnTo » n'est pas une adresse d'écran : refusé (et le
 *  cookie qui le transporte reste petit). */
const MAX_RETURN_TO_LENGTH = 2048;

/** Cookie qui garde la page demandée pendant l'aller-retour vers Microsoft. */
const RETURN_TO_COOKIE = 'auth_return_to';

/** Adresse et navigateur du client, tels que le journal d'audit les garde. */
function clientTrace(req: Request): Pick<AuditEntryInput, 'ip' | 'userAgent'> {
  return { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? 'unknown' };
}

/**
 * Valide qu'un returnTo est un chemin relatif sûr vers CE frontend, pas une
 * redirection ouverte. L'ancienne regex (/^\/[^/]/) ne rejetait que le
 * double-slash ("//evil.com") : elle laissait passer des vecteurs comme
 * "/\evil.com" ou "/%09/evil.com", "/%0a/evil.com" — un backslash ou un
 * caractère de contrôle qu'un navigateur peut normaliser différemment de
 * `new URL()` côté serveur. Vérifications indépendantes :
 *  a) une chaîne (un paramètre répété arrive en tableau), de taille raisonnable
 *  b) chemin relatif : commence par un seul "/" (ni "//", ni adresse absolue)
 *  c) aucun backslash ni caractère de contrôle (DEL compris) dans la chaîne brute
 *  d) une fois résolu contre frontendUrl, l'origine reste bien celle du front
 */
export function isSafeReturnTo(returnTo: unknown, frontendUrl: string): returnTo is string {
  if (typeof returnTo !== 'string' || returnTo.length > MAX_RETURN_TO_LENGTH) return false;
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\\x00-\x1f\x7f]/.test(returnTo)) return false;
  try {
    return new URL(returnTo, frontendUrl).origin === new URL(frontendUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Connexion et session. Les routes qui établissent la session (connexion
 * locale ou SSO, rafraîchissement par cookie) et celles que la page de
 * connexion lit avant toute session sont `@Public()` ; les autres concernent
 * la session courante et sont ouvertes à tout rôle connecté.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: AppConfigService,
    private readonly settings: ConfigRegistryService,
    private readonly audit: AuditService,
  ) {}

  @Get('login')
  @Public()
  async login(
    @Query('returnTo') returnTo: unknown,
    @Query('prompt') prompt: string | undefined,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const state = crypto.randomBytes(16).toString('hex');
      const { url: loginUrl, codeVerifier } = await this.authService.getLoginUrl(state, prompt);
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('oauth_state', state, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      res.cookie('oauth_code_verifier', codeVerifier, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      // Page demandée, gardée le temps de l'aller-retour (chemins internes
      // seulement, voir isSafeReturnTo). Sinon, on efface celle d'une tentative
      // précédente : elle ne doit pas ressurgir après cette connexion-ci.
      if (isSafeReturnTo(returnTo, frontendUrl)) {
        res.cookie(RETURN_TO_COOKIE, returnTo, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      } else {
        res.clearCookie(RETURN_TO_COOKIE);
      }
      return res.redirect(loginUrl);
    } catch (err) {
      return res.redirect(`${frontendUrl}/login?error=entra_config_missing`);
    }
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Lu puis effacé dès l'arrivée, quelle que soit l'issue (erreur Microsoft,
    // état invalide, échec de l'échange) : il ne sert qu'une fois.
    const returnTo: unknown = req.cookies?.[RETURN_TO_COOKIE];
    res.clearCookie(RETURN_TO_COOKIE);

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }

    const savedState = req.cookies['oauth_state'];
    if (!savedState || savedState !== state) {
      this.logger.warn(
        `Callback SSO — état invalide : cookie oauth_state ${savedState ? 'présent mais différent de la query' : 'ABSENT'}. ` +
        `Cookies reçus au callback : [${Object.keys(req.cookies || {}).join(', ') || 'aucun'}]. ` +
        `Si "aucun"/absent : les cookies SameSite=Lax ne reviennent pas de Microsoft (vérifier HTTPS, domaine identique, NODE_ENV).`,
      );
      return res.redirect(`${frontendUrl}/login?error=invalid_state`);
    }

    res.clearCookie('oauth_state');

    // Read and clear PKCE code verifier
    const codeVerifier = req.cookies['oauth_code_verifier'];
    res.clearCookie('oauth_code_verifier');

    try {
      const { accessToken, refreshToken, user } = await this.authService.handleCallback(code, state, codeVerifier);
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      await this.audit.recordSafely('login_sso', { actorId: user.id, actorEmail: user.email, ...clientTrace(req) });
      const destination = isSafeReturnTo(returnTo, frontendUrl) ? `${frontendUrl}${returnTo}` : `${frontendUrl}/`;
      return res.redirect(destination);
    } catch (err) {
      this.logger.error(
        `Callback SSO — échange de jetons échoué : ${(err as Error).message}. ` +
        `Vérifier le redirect_uri (doit être exactement l'URI enregistré dans Entra), ` +
        `la validité du client_secret, et l'horloge du serveur (PKCE/JWT).`,
        (err as Error).stack,
      );
      // account_conflict : création SSO en conflit résiduel (LOT C bug #4) —
      // distinct de auth_failed pour que le front puisse afficher un message
      // adapté ("réessayez" plutôt qu'une erreur de configuration).
      const errorCode = err instanceof AccountConflictException ? 'account_conflict' : 'auth_failed';
      return res.redirect(`${frontendUrl}/login?error=${errorCode}`);
    }
  }

  // Throttling par utilisateur (sub du refresh token), pas par IP : le trafic
  // passe par le NAT du site, donc un throttle par IP (le ThrottlerGuard
  // global posé en APP_GUARD) déconnecte tous les collègues d'un coup dès que
  // quelques tokens expirent la même minute (LOT C bug #1). @SkipThrottle()
  // neutralise le guard global sur CETTE route pour éviter le double comptage
  // (les deux guards partagent le même storage) ; UserThrottlerGuard applique
  // sa propre limite (20/min/utilisateur) — voir user-throttler.guard.ts.
  @Post('refresh')
  @Public()
  @UseGuards(UserThrottlerGuard)
  @SkipThrottle()
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException();

    const tokens = await this.authService.refreshAccessToken(refreshToken);
    this.authService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return res.json({ ok: true });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ALL_ROLES)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    // Revoke both tokens so they cannot be reused after logout
    const accessToken = req.cookies?.['access_token'];
    if (accessToken) {
      this.authService.revokeToken(accessToken);
    }
    const logoutRefreshToken = req.cookies?.['refresh_token'];
    if (logoutRefreshToken) {
      // Persisted in DB so the revocation survives a backend restart
      await this.authService.revokeRefreshToken(logoutRefreshToken);
    }
    await this.audit.recordSafely('logout', { actorId: user.id, actorEmail: user.email, ...clientTrace(req) });
    this.authService.clearAuthCookies(res);
    return res.json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ALL_ROLES)
  async me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('setup-required')
  @Public()
  async setupRequired() {
    const required = await this.configService.isSetupRequired();
    return { setupRequired: required };
  }

  @Post('local-login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async localLogin(
    @Body() dto: LocalLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!(await this.settings.getBool('general.local_auth_enabled'))) {
      throw new ForbiddenException('Authentification locale désactivée');
    }
    const trace = clientTrace(req);
    // Normalisé pour que les entrées d'audit correspondent exactement à ce que
    // checkBruteForce() recherche (LOT C bug #2/#6) — sinon un email soumis
    // avec une casse différente d'une tentative à l'autre échapperait au compteur.
    const normalizedEmail = normalizeEmail(dto.email);
    try {
      const { accessToken, refreshToken, mustChangePassword } = await this.authService.localLogin(dto.email, dto.password, clientIp(req));
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      await this.audit.recordSafely('login_local_success', { actorEmail: normalizedEmail, ...trace });
      return res.json({ ok: true, mustChangePassword });
    } catch (err) {
      // A lockout rejection is logged under a distinct action so that it does
      // NOT feed checkBruteForce() and extend the lockout window indefinitely.
      const action = err instanceof AccountLockedException ? 'login_local_locked' : 'login_local_failed';
      await this.audit.recordSafely(action, { actorEmail: normalizedEmail, ...trace });
      throw err;
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ALL_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    // Tokens issued before the change are now rejected (passwordChangedAt check):
    // re-issue fresh cookies so the current session continues seamlessly.
    const tokens = await this.authService.createTokensForUser(user);
    this.authService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    await this.audit.recordSafely('password_changed', { actorId: user.id, actorEmail: user.email, ...clientTrace(req) });
    return res.json({ ok: true });
  }

  @Get('local-auth-status')
  @Public()
  async localAuthStatus() {
    return { enabled: await this.settings.getBool('general.local_auth_enabled') };
  }
}
