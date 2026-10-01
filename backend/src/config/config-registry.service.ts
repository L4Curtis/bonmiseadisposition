import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ConfigCategory } from '../contracts/admin';
import type { ConfigRegistryEntry } from '../contracts/config-registry';
import { AppConfigService } from './config.service';
import {
  BooleanConfigKey,
  CONFIG_REGISTRY,
  ConfigKey,
  configDefinition,
  IntegerConfigKey,
  resolveConfigValue,
  splitConfigKey,
  StringConfigKey,
} from './config-registry';

/** Masque d'un secret renseigné (même convention que `AppConfigService.getAll`). */
export const SECRET_MASK = '••••••••';

/** Variables d'environnement lues par le registre (remplaçables en test). */
export const CONFIG_REGISTRY_ENV = Symbol('CONFIG_REGISTRY_ENV');

/**
 * Lecture typée de la configuration, d'après le registre (`config-registry.ts`) :
 *
 *   if (await this.settings.getBool('smb.enabled')) …
 *   const days = await this.settings.getInt('tokens.expiry_days'); // 1 à 30, 7 par défaut
 *
 * Les valeurs viennent d'`AppConfigService` (cache, déchiffrement) ; le
 * registre décide du défaut et des bornes. `describe` alimente la route
 * GET /admin/config/registry.
 */
@Injectable()
export class ConfigRegistryService {
  constructor(
    private readonly config: AppConfigService,
    @Optional() @Inject(CONFIG_REGISTRY_ENV) private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private async applied(key: ConfigKey) {
    const { category, name } = splitConfigKey(key);
    return resolveConfigValue(configDefinition(key), await this.config.get(category, name), this.env).applied;
  }

  async getBool(key: BooleanConfigKey): Promise<boolean> {
    return (await this.applied(key)) === true;
  }

  async getInt(key: IntegerConfigKey): Promise<number> {
    return Number(await this.applied(key));
  }

  /** Texte appliqué (un secret est rendu déchiffré) ; `null` si rien. */
  async getString(key: StringConfigKey): Promise<string | null> {
    const value = await this.applied(key);
    return value === null ? null : String(value);
  }

  /** Tous les réglages : saisi, défaut, appliqué. Aucun secret en clair. */
  async describe(): Promise<ConfigRegistryEntry[]> {
    const keys = Object.keys(CONFIG_REGISTRY) as ConfigKey[];
    const categories = [...new Set(keys.map((key) => splitConfigKey(key).category))];
    const stored = new Map<ConfigCategory, Record<string, string | null>>(
      await Promise.all(
        categories.map(async (category) => [category, await this.config.getAll(category, { maskSecrets: true })] as const),
      ),
    );
    return keys.map((key) => this.describeOne(key, stored.get(splitConfigKey(key).category) ?? {}));
  }

  private describeOne(key: ConfigKey, storedValues: Record<string, string | null>): ConfigRegistryEntry {
    const definition = configDefinition(key);
    const { category, name } = splitConfigKey(key);
    const storedValue = storedValues[name] ?? null;
    const secret = definition.type === 'secret';
    const resolved = resolveConfigValue(definition, storedValue, this.env);
    return {
      key,
      category,
      name,
      label: definition.label,
      type: definition.type,
      min: definition.min ?? null,
      max: definition.max ?? null,
      secret,
      adminOnly: definition.adminOnly,
      healthSection: definition.healthSection,
      storedValue: secret && storedValue ? SECRET_MASK : storedValue,
      defaultValue: definition.defaultValue,
      appliedValue: secret && resolved.applied !== null ? SECRET_MASK : resolved.applied,
      source: resolved.source,
      adjusted: resolved.adjusted,
    };
  }
}
