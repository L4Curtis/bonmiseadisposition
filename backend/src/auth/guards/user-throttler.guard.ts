import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from '../auth.service';

// Noms de bucket dédiés : évitent toute collision avec le throttler 'default'
// de l'APP_GUARD global (voir commentaire sur canActivate ci-dessous).
const REFRESH_USER_THROTTLER_NAME = 'refresh-user';
const REFRESH_USER_LIMIT = 20;
const REFRESH_IP_THROTTLER_NAME = 'refresh-ip';
const REFRESH_IP_LIMIT = 200;
const REFRESH_TTL_MS = 60_000;

interface RefreshTokenClaims {
  sub?: string;
  type?: string;
}

/**
 * Tracker pour /auth/refresh : identifie l'appelant par l'utilisateur (sub du
 * refresh token) UNIQUEMENT si le jeton est cryptographiquement valide
 * (signature HS256 + secret serveur + type 'refresh'). Un jeton forgé (sub
 * arbitraire, signature absente ou invalide) retombe sur l'IP.
 *
 * Correction (relecture LOT C bug #1) : la version précédente utilisait
 * `jwtService.decode()`, qui NE VÉRIFIE PAS la signature — un client pouvait
 * fabriquer un cookie refresh_token avec un `sub` aléatoire à CHAQUE requête
 * et obtenir un bucket de rate-limit différent (donc illimité) sans jamais
 * présenter de jeton valide. `verify()` élimine ce contournement : un jeton
 * invalide retombe systématiquement sur le bucket IP.
 *
 * Exporté séparément de la classe pour être testé sans instancier tout le
 * guard (qui a besoin du storage/reflector Throttler).
 */
export function getRefreshTokenTracker(
  req: Pick<Request, 'cookies' | 'ip'>,
  jwtService: Pick<JwtService, 'verify'>,
  jwtSecret: string,
): string {
  const refreshToken = req.cookies?.['refresh_token'] as string | undefined;
  if (refreshToken) {
    try {
      const claims = jwtService.verify<RefreshTokenClaims>(refreshToken, {
        secret: jwtSecret,
        algorithms: ['HS256'],
      });
      if (claims.sub && claims.type === 'refresh') {
        return `user:${claims.sub}`;
      }
    } catch {
      // Signature invalide, jeton expiré/malformé, ou type incorrect — repli sur l'IP.
    }
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Réécrit entièrement canActivate() plutôt que de réutiliser la boucle
   * héritée de ThrottlerGuard : cette dernière relit la métadonnée
   * @SkipThrottle('default') posée sur la route pour neutraliser le
   * ThrottlerGuard global (APP_GUARD, cf. auth.controller.ts) — la réutiliser
   * ici sauterait ÉGALEMENT cette vérification puisque les deux guards
   * partagent la même configuration Throttler globale (module @Global()).
   *
   * Deux contrôles indépendants sont appliqués, dans cet ordre :
   *  1. Par IP (bucket 'refresh-ip', 200/min) — défense en profondeur
   *     appliquée à TOUTE requête, jeton valide ou non. Plafonne l'abus
   *     distribué (ex. plusieurs refresh tokens volés utilisés depuis la
   *     même IP) même quand le tracker par utilisateur ci-dessous est
   *     satisfait pour chacun individuellement.
   *  2. Par utilisateur (bucket 'refresh-user', 20/min) — seulement pour un
   *     jeton dont la signature est valide ; sinon repli sur l'IP (même
   *     tracker que le contrôle 1, mais bucket distinct).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const ip = (req as Request).ip ?? 'unknown';

    await this.handleRequest({
      context,
      limit: REFRESH_IP_LIMIT,
      ttl: REFRESH_TTL_MS,
      throttler: { name: REFRESH_IP_THROTTLER_NAME, limit: REFRESH_IP_LIMIT, ttl: REFRESH_TTL_MS },
      blockDuration: REFRESH_TTL_MS,
      getTracker: () => Promise.resolve(`ip:${ip}`),
      generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
    });

    const jwtSecret = this.authService.getJwtSecret();
    const tracker = getRefreshTokenTracker(req as Request, this.jwtService, jwtSecret);

    return this.handleRequest({
      context,
      limit: REFRESH_USER_LIMIT,
      ttl: REFRESH_TTL_MS,
      throttler: { name: REFRESH_USER_THROTTLER_NAME, limit: REFRESH_USER_LIMIT, ttl: REFRESH_TTL_MS },
      blockDuration: REFRESH_TTL_MS,
      getTracker: () => Promise.resolve(tracker),
      generateKey: (ctx, trackerValue, name) => this.generateKey(ctx, trackerValue, name),
    });
  }
}
