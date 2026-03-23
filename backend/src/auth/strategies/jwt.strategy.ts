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
      secretOrKeyProvider: async (_req: any, _rawJwtToken: any, done: any) => {
        done(null, authService.getJwtSecret());
      },
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
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
        active: true,
        // passwordHash intentionally excluded
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
