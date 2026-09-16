import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

/** Nombre maximal d'entrées conservées ; au-delà, éviction FIFO (la plus
 *  ancienne insertion, indépendamment de son expiration). */
const MAX_ENTRIES = 200;

/**
 * Cache mémoire des réponses KPI, partagé par les trois endpoints.
 *
 * - TTL par entrée (60 s par défaut) : une entrée expirée est recalculée.
 * - Dédoublonnage : deux appels concurrents sur la même clé, avant
 *   résolution, partagent la même promesse (un seul calcul en vol).
 * - Une promesse rejetée est retirée immédiatement du cache : l'erreur n'est
 *   jamais mise en cache, l'appel suivant relance le calcul.
 * - Éviction FIFO au-delà de `MAX_ENTRIES` clés distinctes.
 */
@Injectable()
export class KpiCacheService {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  getOrCompute<T>(key: string, compute: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const now = Date.now();
    const existing = this.store.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > now) {
      return existing.promise;
    }

    const promise = compute();
    this.store.set(key, { promise, expiresAt: now + ttlMs });
    this.discardOnRejection(key, promise);
    this.evictOldestIfNeeded();

    return promise;
  }

  clear(): void {
    this.store.clear();
  }

  /** Retire l'entrée dès que sa promesse rejette, à condition qu'elle n'ait
   *  pas déjà été remplacée entre-temps par un recalcul plus récent. */
  private discardOnRejection<T>(key: string, promise: Promise<T>): void {
    promise.catch(() => {
      if (this.store.get(key)?.promise === promise) {
        this.store.delete(key);
      }
    });
  }

  private evictOldestIfNeeded(): void {
    while (this.store.size > MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }
}
