import { Controller, Get, Query, Req, Res, Post, Body, UseGuards, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AppConfigService } from '../config/config.service';
import { LocalLoginDto } from './dto/local-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('login')
  async login(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    try {
      const state = crypto.randomBytes(16).toString('hex');
      const { url: loginUrl, codeVerifier } = await this.authService.getLoginUrl(state);
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('oauth_state', state, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      res.cookie('oauth_code_verifier', codeVerifier, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      // Store returnTo (safe relative paths only — reject double-slash to prevent //evil.com redirect)
      if (returnTo && /^\/[^/]/.test(returnTo)) {
        res.cookie('auth_return_to', returnTo, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
      }
      return res.redirect(loginUrl);
    } catch (err) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=entra_config_missing`);
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error)}`);
    }

    const savedState = req.cookies['oauth_state'];
    if (!savedState || savedState !== state) {
      return res.redirect(`${frontendUrl}/login?error=invalid_state`);
    }

    res.clearCookie('oauth_state');

    // Read and clear PKCE code verifier
    const codeVerifier = req.cookies['oauth_code_verifier'];
    res.clearCookie('oauth_code_verifier');

    // Read and clear returnTo
    const returnTo = req.cookies['auth_return_to'];
    res.clearCookie('auth_return_to');

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string)
      ?? req.socket?.remoteAddress
      ?? 'unknown';
    try {
      const { accessToken, refreshToken, user } = await this.authService.handleCallback(code, state, codeVerifier);
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      await this.prisma.auditLog.create({
        data: {
          userId: user?.id,
          userEmail: user?.email,
          action: 'login_sso',
          ipAddress: ip,
          userAgent: req.headers['user-agent'] ?? 'unknown',
        },
      }).catch(() => { /* non-blocking */ });
      const destination =
        returnTo && /^\/[^/]/.test(returnTo) ? `${frontendUrl}${returnTo}` : `${frontendUrl}/`;
      return res.redirect(destination);
    } catch (err) {
      return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException();

    const tokens = await this.authService.refreshAccessToken(refreshToken);
    this.authService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return res.json({ ok: true });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async logout(@CurrentUser() user: any, @Req() req: Request, @Res() res: Response) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string)
      ?? req.socket?.remoteAddress
      ?? 'unknown';
    // Revoke both tokens so they cannot be reused after logout
    const accessToken = req.cookies?.['access_token'];
    if (accessToken) {
      this.authService.revokeToken(accessToken);
    }
    const logoutRefreshToken = req.cookies?.['refresh_token'];
    if (logoutRefreshToken) {
      this.authService.revokeToken(logoutRefreshToken, 8 * 60 * 60 * 1000);
    }
    await this.prisma.auditLog.create({
      data: {
        userId: user?.id,
        userEmail: user?.email,
        action: 'logout',
        ipAddress: ip,
        userAgent: req.headers['user-agent'] ?? 'unknown',
      },
    }).catch(() => { /* non-blocking */ });
    this.authService.clearAuthCookies(res);
    return res.json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return user;
  }

  @Get('setup-required')
  async setupRequired() {
    const required = await this.configService.isSetupRequired();
    return { setupRequired: required };
  }

  @Post('local-login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async localLogin(
    @Body() dto: LocalLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const localAuthEnabled = await this.configService.get('general', 'local_auth_enabled');
    if (localAuthEnabled === 'false') {
      throw new ForbiddenException('Authentification locale désactivée');
    }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string)
      ?? req.socket?.remoteAddress
      ?? 'unknown';
    const ua = req.headers['user-agent'] ?? 'unknown';
    try {
      const { accessToken, refreshToken, mustChangePassword } = await this.authService.localLogin(dto.email, dto.password);
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      await this.prisma.auditLog.create({
        data: { userEmail: dto.email, action: 'login_local_success', ipAddress: ip, userAgent: ua },
      }).catch(() => { /* non-blocking */ });
      return res.json({ ok: true, mustChangePassword });
    } catch (err) {
      await this.prisma.auditLog.create({
        data: { userEmail: dto.email, action: 'login_local_failed', ipAddress: ip, userAgent: ua },
      }).catch(() => { /* non-blocking */ });
      throw err;
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string)
      ?? req.socket?.remoteAddress
      ?? 'unknown';
    await this.prisma.auditLog.create({
      data: { userId: user?.id, userEmail: user?.email, action: 'password_changed', ipAddress: ip, userAgent: req.headers['user-agent'] ?? 'unknown' },
    }).catch(() => { /* non-blocking */ });
    return res.json({ ok: true });
  }

  @Get('local-auth-status')
  async localAuthStatus() {
    const enabled = await this.configService.get('general', 'local_auth_enabled');
    return { enabled: enabled !== 'false' };
  }
}
