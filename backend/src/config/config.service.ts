import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

@Injectable()
export class AppConfigService {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private cacheKey(category: string, key: string) {
    return `${category}:${key}`;
  }

  async get(category: string, key: string): Promise<string | null> {
    const ck = this.cacheKey(category, key);
    const cached = this.cache.get(ck);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const record = await this.prisma.appConfig.findUnique({
      where: { category_key: { category, key } },
    });

    if (!record) {
      this.cache.set(ck, { value: null, expiresAt: Date.now() + this.TTL_MS });
      return null;
    }

    let value = record.value;
    if (record.encrypted && value) {
      value = this.encryption.decrypt(value);
    }

    this.cache.set(ck, { value, expiresAt: Date.now() + this.TTL_MS });
    return value;
  }

  async set(
    category: string,
    key: string,
    value: string,
    options?: { encrypted?: boolean; description?: string; updatedById?: string },
  ): Promise<void> {
    const shouldEncrypt = options?.encrypted ?? false;
    const storedValue = shouldEncrypt ? this.encryption.encrypt(value) : value;

    await this.prisma.appConfig.upsert({
      where: { category_key: { category, key } },
      update: {
        value: storedValue,
        encrypted: shouldEncrypt,
        description: options?.description,
        updatedById: options?.updatedById,
      },
      create: {
        category,
        key,
        value: storedValue,
        encrypted: shouldEncrypt,
        description: options?.description,
        updatedById: options?.updatedById,
      },
    });

    // Invalidate cache
    this.cache.delete(this.cacheKey(category, key));
  }

  async getAll(category: string, options?: { maskSecrets?: boolean }): Promise<Record<string, string | null>> {
    const records = await this.prisma.appConfig.findMany({ where: { category } });
    const result: Record<string, string | null> = {};
    for (const record of records) {
      if (options?.maskSecrets && record.encrypted && record.value) {
        // Ne jamais renvoyer les secrets déchiffrés au frontend
        result[record.key] = '••••••••';
      } else {
        let value = record.value;
        if (record.encrypted && value) {
          value = this.encryption.decrypt(value);
        }
        result[record.key] = value;
      }
    }
    return result;
  }

  invalidateCache(category?: string, key?: string) {
    if (category && key) {
      this.cache.delete(this.cacheKey(category, key));
    } else if (category) {
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${category}:`)) this.cache.delete(k);
      }
    } else {
      this.cache.clear();
    }
  }

  /** Check if setup wizard is needed — false if a local admin exists */
  async isSetupRequired(): Promise<boolean> {
    const localAdmin = await this.prisma.user.findFirst({
      where: { isLocalAccount: true, role: 'admin', active: true },
    });
    if (localAdmin) return false;
    const count = await this.prisma.appConfig.count();
    return count === 0;
  }
}
