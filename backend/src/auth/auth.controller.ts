import { Controller, Get, Query, Req, Res, Post, Body, UseGuards, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

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
      const loginUrl = await this.authService.getLoginUrl(state);
      res.cookie('oauth_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
      // Store returnTo (safe relative paths only)
      if (returnTo && returnTo.startsWith('/')) {
        res.cookie('auth_return_to', returnTo, { httpOnly: true, maxAge: 10 * 60 * 1000 });
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
      return res.redirect(`${frontendUrl}/login?error=${error}`);
    }

    const savedState = req.cookies['oauth_state'];
    if (!savedState || savedState !== state) {
      return res.redirect(`${frontendUrl}/login?error=invalid_state`);
    }

    res.clearCookie('oauth_state');

    // Read and clear returnTo
    const returnTo = req.cookies['auth_return_to'];
    res.clearCookie('auth_return_to');

    try {
      const { accessToken, refreshToken } = await this.authService.handleCallback(code, state);
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      // Redirect to returnTo if valid, otherwise root (frontend redirects by role: IT→/dashboard, collab→/mes-bons)
      const destination =
        returnTo && returnTo.startsWith('/') ? `${frontendUrl}${returnTo}` : `${frontendUrl}/`;
      return res.redirect(destination);
    } catch (err) {
      return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) throw new UnauthorizedException();

    const accessToken = await this.authService.refreshAccessToken(refreshToken);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  @Post('logout')
  async logout(@Res() res: Response) {
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

  /** DEV ONLY — login as any user by email (creates user if not exists) */
  @Post('dev-login')
  async devLogin(
    @Body() body: { email: string; role?: string },
    @Res() res: Response,
  ) {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException('Not available in production');
    }

    let user = await this.prisma.user.findFirst({ where: { email: body.email } });
    const role = (body.role as any) || 'admin';
    const isItStaff = role === 'admin' || role === 'technician';

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          samAccountName: body.email.split('@')[0],
          displayName: body.email.split('@')[0],
          email: body.email,
          role,
          isItStaff,
          active: true,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role, isItStaff },
      });
    }

    const { accessToken, refreshToken } = await this.authService.createTokensForUser(user);

    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return res.json({ ok: true, user });
  }

  @Post('local-login')
  async localLogin(
    @Body() body: { email: string; password: string },
    @Res() res: Response,
  ) {
    const localAuthEnabled = await this.configService.get('general', 'local_auth_enabled');
    if (localAuthEnabled === 'false') {
      throw new ForbiddenException('Authentification locale désactivée');
    }
    const { accessToken, refreshToken } = await this.authService.localLogin(body.email, body.password);
    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return res.json({ ok: true });
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    await this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
    return res.json({ ok: true });
  }

  @Get('local-auth-status')
  async localAuthStatus() {
    const enabled = await this.configService.get('general', 'local_auth_enabled');
    return { enabled: enabled !== 'false' };
  }
}
