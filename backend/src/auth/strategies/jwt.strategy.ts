import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['access_token'] || null,
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider: async (_req: Request, _rawJwtToken: string, done: (err: Error | null, secret?: string) => void) => {
        done(null, authService.getJwtSecret());
      },
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: string; email: string; role: string }) {
    // Check if this token has been revoked (e.g. after logout)
    const token = req?.cookies?.['access_token'];
    if (token && this.authService.isTokenRevoked(token)) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        samAccountName: true,
        displayName: true,
        email: true,
        department: true,
        company: true,
        title: true,
        filialeId: true,
        filiale: true,
        isItStaff: true,
        role: true,
        isLocalAccount: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        active: true,
        // passwordHash intentionally excluded
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    // Password expiration: force change after 90 days for local accounts
    if (user.isLocalAccount && user.passwordChangedAt && !user.mustChangePassword) {
      const daysSinceChange = (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange > 90) {
        return { ...user, mustChangePassword: true };
      }
    }

    return user;
  }
}
