import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private cacheKey(category: string, key: string) {
    return `${category}:${key}`;
  }

  /** Decrypt with an explicit diagnostic instead of letting the raw crypto
   *  error cascade — an ENCRYPTION_KEY rotation or corrupted value would
   *  otherwise surface as opaque 500s everywhere. */
  private safeDecrypt(category: string, key: string, value: string): string | null {
    try {
      return this.encryption.decrypt(value);
    } catch (err) {
      this.logger.error(
        `Valeur chiffrée illisible pour ${category}:${key} — ENCRYPTION_KEY a-t-elle changé depuis le chiffrement ? (${(err as Error).message})`,
      );
      return null;
    }
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
      value = this.safeDecrypt(category, key, value);
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
          value = this.safeDecrypt(category, record.key, value);
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

  /**
   * Canari de chiffrement : vérifie AU DÉMARRAGE que l'ENCRYPTION_KEY courante
   * est bien celle utilisée à la première initialisation. Au 1er lancement, pose
   * le canari ; ensuite, échoue explicitement si la clé a changé — plutôt que de
   * laisser l'app démarrer et écraser/illisibiliser silencieusement les données
   * chiffrées (signatures, pièces jointes, secrets de config).
   */
  async verifyEncryptionCanary(): Promise<void> {
    const CANARY = 'bon-mise-disposition-canary-v1';
    const record = await this.prisma.appConfig.findUnique({
      where: { category_key: { category: 'system', key: 'encryption_canary' } },
    });

    if (!record || !record.value) {
      await this.prisma.appConfig.upsert({
        where: { category_key: { category: 'system', key: 'encryption_canary' } },
        update: { value: this.encryption.encrypt(CANARY), encrypted: true },
        create: {
          category: 'system',
          key: 'encryption_canary',
          value: this.encryption.encrypt(CANARY),
          encrypted: true,
          description: 'Vérifie au démarrage que ENCRYPTION_KEY est inchangée — NE PAS modifier ni supprimer',
        },
      });
      this.logger.log('Canari ENCRYPTION_KEY initialisé');
      return;
    }

    try {
      if (this.encryption.decrypt(record.value) !== CANARY) {
        throw new Error('valeur canari inattendue');
      }
    } catch (err) {
      throw new Error(
        `ENCRYPTION_KEY invalide : le canari de chiffrement est illisible (${(err as Error).message}). ` +
        'La clé a probablement changé depuis la première initialisation. Restaurez l\'ENCRYPTION_KEY ' +
        'd\'origine — sinon toutes les données chiffrées (signatures, pièces jointes, secrets) resteront ' +
        'illisibles. Démarrage interrompu (fail-fast).',
      );
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
