import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Blacklist de tokens révoqués : cache mémoire (hash → expiry timestamp) tenu
 * par AuthService, ici manipulé via des fonctions explicites plutôt que des
 * méthodes de classe. Les révocations de refresh token sont en plus
 * persistées en base (revoked_tokens) pour survivre à un redémarrage.
 *
 * Extrait de AuthService sans changement de comportement — `store` est le
 * même `Map` que celui détenu par l'instance AuthService (état partagé
 * explicite, pas un nouveau singleton caché).
 */
export type RevokedTokenStore = Map<string, number>;

export interface TokenRevocationDeps {
  prisma: PrismaService;
  logger: Logger;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Revoke an access token (in-memory only — 15 min max exposure) */
export function revokeToken(
  store: RevokedTokenStore,
  token: string,
  ttlMs: number,
  onOverCapacity: () => void,
): void {
  if (store.size >= 10000) {
    onOverCapacity();
  }
  store.set(hashToken(token), Date.now() + ttlMs);
}

/** Revoke a refresh token: in-memory + persisted in DB (survives restarts) */
export async function revokeRefreshToken(
  deps: TokenRevocationDeps,
  store: RevokedTokenStore,
  token: string,
  ttlMs: number,
): Promise<void> {
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  store.set(hash, expiresAt.getTime());
  try {
    await deps.prisma.revokedToken.upsert({
      where: { tokenHash: hash },
      update: { expiresAt },
      create: { tokenHash: hash, expiresAt },
    });
  } catch (err) {
    deps.logger.error(`Persistance de la révocation échouée: ${(err as Error).message}`);
  }
}

/** Check if a token has been revoked (in-memory fast path) */
export function isTokenRevoked(store: RevokedTokenStore, token: string): boolean {
  return store.has(hashToken(token));
}

/** Check revocation for refresh tokens: memory first, then persistent store */
export async function isRefreshTokenRevoked(
  deps: Pick<TokenRevocationDeps, 'prisma'>,
  store: RevokedTokenStore,
  token: string,
): Promise<boolean> {
  const hash = hashToken(token);
  if (store.has(hash)) return true;
  const record = await deps.prisma.revokedToken.findUnique({ where: { tokenHash: hash } });
  return !!record && record.expiresAt.getTime() > Date.now();
}

export async function cleanupRevokedTokens(
  deps: Pick<TokenRevocationDeps, 'prisma'>,
  store: RevokedTokenStore,
): Promise<void> {
  const now = Date.now();
  for (const [hash, expiresAt] of store) {
    if (expiresAt <= now) {
      store.delete(hash);
    }
  }
  await deps.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
}
