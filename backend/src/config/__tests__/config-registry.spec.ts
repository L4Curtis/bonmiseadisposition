import { CONFIG_HEALTH_CATEGORIES } from '../../admin/config-health';
import { DEFAULT_SIGNATURE_OVERDUE_DAYS } from '../../common/bon-predicates';
import { CONFIG_REGISTRY, configDefinition, resolveConfigValue } from '../config-registry';
import type { ConfigKey } from '../config-registry';
import { ConfigRegistryService, SECRET_MASK } from '../config-registry.service';
import type { AppConfigService } from '../config.service';

describe('CONFIG_REGISTRY — structure', () => {
  const keys = Object.keys(CONFIG_REGISTRY) as ConfigKey[];

  it('une entrée par réglage de l’écran, clé « rubrique.nom »', () => {
    expect(keys.length).toBe(42);
    for (const key of keys) expect(key).toMatch(/^[a-z]+\.[a-z0-9_]+$/);
  });

  it('chaque rubrique est une rubrique de l’état de santé', () => {
    for (const key of keys) {
      expect(CONFIG_HEALTH_CATEGORIES).toContain(configDefinition(key).healthSection);
    }
  });

  it('les secrets sont ceux que l’on chiffre en base', () => {
    const secrets = keys.filter((key) => CONFIG_REGISTRY[key].type === 'secret');
    expect(secrets).toEqual(['entra.client_secret', 'ldap.bind_password', 'smtp.password', 'smb.password']);
  });

  it('chaque entier a un défaut entre ses bornes', () => {
    for (const key of keys) {
      const definition = configDefinition(key);
      if (definition.type !== 'integer') continue;
      expect(typeof definition.defaultValue).toBe('number');
      expect(definition.defaultValue as number).toBeGreaterThanOrEqual(definition.min ?? -Infinity);
      expect(definition.defaultValue as number).toBeLessThanOrEqual(definition.max ?? Infinity);
    }
  });

  it('reprend les défauts appliqués aujourd’hui par les services', () => {
    expect(CONFIG_REGISTRY['rappels.signature_overdue_days'].defaultValue).toBe(DEFAULT_SIGNATURE_OVERDUE_DAYS);
    expect(CONFIG_REGISTRY['tokens.expiry_days']).toMatchObject({ defaultValue: 7, min: 1, max: 30 });
    expect(CONFIG_REGISTRY['retention.anonymize_months']).toMatchObject({ defaultValue: 60, min: 60 });
    expect(CONFIG_REGISTRY['retention.audit_logs_years'].defaultValue).toBe(5);
    expect(CONFIG_REGISTRY['smtp.port'].defaultValue).toBe(587);
    expect(CONFIG_REGISTRY['general.local_auth_enabled'].defaultValue).toBe(true);
    expect(CONFIG_REGISTRY['smb.enabled'].defaultValue).toBe(false);
  });

  it('chaque réglage a un libellé français', () => {
    for (const key of keys) expect(configDefinition(key).label.trim()).not.toBe('');
  });
});

describe('resolveConfigValue — valeur appliquée', () => {
  it('booléen : « true » / « false » saisis, sinon le défaut', () => {
    const rappels = configDefinition('rappels.enabled');
    expect(resolveConfigValue(rappels, 'false')).toEqual({ applied: false, source: 'stored', adjusted: false });
    expect(resolveConfigValue(rappels, null)).toEqual({ applied: true, source: 'default', adjusted: false });
    expect(resolveConfigValue(rappels, 'oui')).toEqual({ applied: true, source: 'default', adjusted: true });
  });

  it('entier : valeur saisie, ramenée à ses bornes, défaut si illisible', () => {
    const expiry = configDefinition('tokens.expiry_days');
    expect(resolveConfigValue(expiry, ' 12 ')).toEqual({ applied: 12, source: 'stored', adjusted: false });
    expect(resolveConfigValue(expiry, '90')).toEqual({ applied: 30, source: 'stored', adjusted: true });
    expect(resolveConfigValue(expiry, '0')).toEqual({ applied: 1, source: 'stored', adjusted: true });
    expect(resolveConfigValue(expiry, '7j')).toEqual({ applied: 7, source: 'default', adjusted: true });
    expect(resolveConfigValue(expiry, '')).toEqual({ applied: 7, source: 'default', adjusted: false });
  });

  it('plancher légal de l’anonymisation : jamais moins de 60 mois', () => {
    expect(resolveConfigValue(configDefinition('retention.anonymize_months'), '3')).toMatchObject({ applied: 60, adjusted: true });
  });

  it('texte : valeur saisie sans espaces autour, sinon le défaut', () => {
    const filter = configDefinition('ldap.user_filter');
    expect(resolveConfigValue(filter, ' (objectClass=user) ')).toMatchObject({ applied: '(objectClass=user)', source: 'stored' });
    expect(resolveConfigValue(filter, '   ')).toMatchObject({ applied: filter.defaultValue, source: 'default' });
    expect(resolveConfigValue(configDefinition('smtp.host'), null)).toEqual({ applied: null, source: 'default', adjusted: false });
  });

  it('URL publique : la variable FRONTEND_URL quand rien n’est saisi', () => {
    const appUrl = configDefinition('general.app_url');
    expect(resolveConfigValue(appUrl, null, { FRONTEND_URL: 'https://bons.livio.fr' })).toEqual({
      applied: 'https://bons.livio.fr',
      source: 'environment',
      adjusted: false,
    });
    expect(resolveConfigValue(appUrl, 'https://saisie.livio.fr', { FRONTEND_URL: 'https://env' })).toMatchObject({
      applied: 'https://saisie.livio.fr',
      source: 'stored',
    });
  });
});

describe('ConfigRegistryService', () => {
  function serviceWith(stored: Record<string, Record<string, string | null>>) {
    const config = {
      get: vi.fn(async (category: string, key: string) => stored[category]?.[key] ?? null),
      getAll: vi.fn(async (category: string, options?: { maskSecrets?: boolean }) => {
        const values = stored[category] ?? {};
        if (!options?.maskSecrets) return values;
        return Object.fromEntries(
          Object.entries(values).map(([key, value]) => {
            const secret = CONFIG_REGISTRY[`${category}.${key}` as ConfigKey]?.type === 'secret';
            return [key, secret && value ? SECRET_MASK : value];
          }),
        );
      }),
    };
    return { service: new ConfigRegistryService(config as unknown as AppConfigService, {}), config };
  }

  it('lecture typée : getBool, getInt, getString', async () => {
    const { service } = serviceWith({
      rappels: { enabled: 'false', delay_1: '5' },
      smtp: { host: ' smtp.livio.fr ' },
    });
    await expect(service.getBool('rappels.enabled')).resolves.toBe(false);
    await expect(service.getBool('smb.enabled')).resolves.toBe(false);
    await expect(service.getInt('rappels.delay_1')).resolves.toBe(5);
    await expect(service.getInt('rappels.delay_2')).resolves.toBe(7);
    await expect(service.getString('smtp.host')).resolves.toBe('smtp.livio.fr');
    await expect(service.getString('smtp.user')).resolves.toBeNull();
  });

  it('getString d’un secret : la valeur déchiffrée, pour le service qui s’en sert', async () => {
    const { service } = serviceWith({ smtp: { password: 'motdepasse' } });
    await expect(service.getString('smtp.password')).resolves.toBe('motdepasse');
  });

  it('describe : saisi, défaut et appliqué pour chaque réglage, secrets masqués', async () => {
    const { service, config } = serviceWith({
      tokens: { expiry_days: '90' },
      smtp: { password: 'motdepasse' },
    });
    const entries = await service.describe();

    expect(entries).toHaveLength(Object.keys(CONFIG_REGISTRY).length);
    expect(entries.find((e) => e.key === 'tokens.expiry_days')).toEqual({
      key: 'tokens.expiry_days',
      category: 'tokens',
      name: 'expiry_days',
      label: expect.any(String),
      type: 'integer',
      min: 1,
      max: 30,
      secret: false,
      adminOnly: true,
      healthSection: 'tokens',
      storedValue: '90',
      defaultValue: 7,
      appliedValue: 30,
      source: 'stored',
      adjusted: true,
    });
    expect(entries.find((e) => e.key === 'smtp.password')).toMatchObject({
      storedValue: SECRET_MASK,
      appliedValue: SECRET_MASK,
      secret: true,
      source: 'stored',
    });
    expect(entries.find((e) => e.key === 'smtp.host')).toMatchObject({ storedValue: null, appliedValue: null, source: 'default' });
    expect(JSON.stringify(entries)).not.toContain('motdepasse');
    expect(config.getAll).toHaveBeenCalledWith('smtp', { maskSecrets: true });
  });
});
