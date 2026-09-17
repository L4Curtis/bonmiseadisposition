import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RevokedTokenStore, isRefreshTokenRevoked, revokeRefreshToken } from './token-revocation';

/** Absolute session lifetime: refresh rotation cannot extend a session past this. */
export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/** Refresh token TTL used both for JWT expiresIn and for the revocation record. */
const REFRESH_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export interface RefreshTokenPayload {
  sub: string;
  type: string;
  authTime?: number;
  iat?: number;
}

export interface SessionTokenDeps {
  jwtService: JwtService;
  prisma: PrismaService;
  logger: Logger;
  store: RevokedTokenStore;
  getJwtSecret: () => string;
}

/** Valide et normalise JWT_SECRET — Erreur au démarrage plutôt qu'un échec
 *  silencieux de signature en production. */
export function resolveJwtSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Generate with: openssl rand -hex 32');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long. Generate with: openssl rand -hex 32');
  }
  return secret;
}

export async function createTokensForUser(
  deps: Pick<SessionTokenDeps, 'jwtService' | 'getJwtSecret'>,
  user: { id: string; email: string; role: string },
  authTime?: number,
): Promise<{ accessToken: string; refreshToken: string }> {
  const jwtSecret = deps.getJwtSecret();
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = deps.jwtService.sign(payload, { secret: jwtSecret, expiresIn: '15m' });
  // authTime = epoch seconds of the ORIGINAL login, carried across rotations
  // to enforce an absolute session lifetime.
  const refreshToken = deps.jwtService.sign(
    { sub: user.id, type: 'refresh', authTime: authTime ?? Math.floor(Date.now() / 1000) },
    { secret: jwtSecret, expiresIn: '8h' },
  );
  return { accessToken, refreshToken };
}

/**
 * Rotation de refresh token avec durée de vie de session absolue. Extrait de
 * AuthService.refreshAccessToken sans changement de comportement (voir les
 * deux phases documentées : validité pure du jeton, puis persistance DB).
 */
export async function refreshAccessToken(
  deps: SessionTokenDeps,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const jwtSecret = deps.getJwtSecret();

  // ── Phase 1 : validité PURE du jeton (signature/type/session absolue) —
  // aucun accès DB ici. Toute erreur est un problème d'authentification
  // légitime → 401. isRefreshTokenRevoked() (accès DB) est volontairement
  // exclu de cette phase : une panne DB ne doit pas se traduire par un 401
  // (cf. phase 2) — voir LOT C bug #2 (relecture).
  let payload: RefreshTokenPayload;
  try {
    payload = deps.jwtService.verify<RefreshTokenPayload>(refreshToken, { secret: jwtSecret, algorithms: ['HS256'] });
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

    if (await isRefreshTokenRevoked({ prisma: deps.prisma }, deps.store, refreshToken)) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Revoke old refresh token (8h TTL to match refresh token lifetime)
    await revokeRefreshToken({ prisma: deps.prisma, logger: deps.logger }, deps.store, refreshToken, REFRESH_TOKEN_TTL_MS);

    let user: { id: string; email: string; role: string; active: boolean; passwordChangedAt: Date | null };
    try {
      user = await deps.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
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

    return await createTokensForUser(deps, user, authTime);
  } catch (err) {
    if (err instanceof UnauthorizedException) throw err;
    deps.logger.error(
      `refreshAccessToken: échec inattendu (DB ?) après validation du jeton: ${(err as Error).message}`,
      (err as Error).stack,
    );
    throw new ServiceUnavailableException('Service temporairement indisponible, réessayez.');
  }
}
