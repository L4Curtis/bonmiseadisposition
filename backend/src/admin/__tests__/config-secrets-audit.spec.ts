import { describe, expect, it } from 'vitest';
import { ConfigSettingsService } from '../config-settings.service';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors';
import { CONFIG_REGISTRY, ConfigKey, splitConfigKey } from '../../config/config-registry';
import { SECRET_MASK } from '../../config/config-registry.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';

/**
 * Aucun secret (SMTP, annuaire, Entra ID, partage réseau…) ne doit sortir dans
 * le journal `config_updated`, ni dans un message d'erreur, quelle que soit la
 * rubrique : le test parcourt TOUTES les clés secrètes du registre, si bien
 * qu'un secret ajouté demain est couvert sans rien écrire de plus.
 */
const SECRET_KEYS = (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).filter((key) => CONFIG_REGISTRY[key].type === 'secret');

function setup(stored: Record<string, string | null>) {
  const prisma = createMockPrismaService();
  const config = createMockConfigService();
  config.getAll.mockResolvedValue(stored);
  const service = new ConfigSettingsService(
    config as never,
    createMockEncryptionService() as never,
    prisma as never,
    new AuditService(prisma as never),
    { validateLdapFilter: vi.fn() } as never,
  );
  const journal = () => JSON.stringify(prisma.auditLog.create.mock.calls);
  return { prisma, service, journal };
}

const actor = { id: 'admin-1', ip: '10.0.0.1', userAgent: 'Chrome' };

describe('Journal des paramètres — aucun secret, pour toutes les clés secrètes du registre', () => {
  it('le registre déclare bien les secrets attendus', () => {
    expect(SECRET_KEYS.sort()).toEqual(['entra.client_secret', 'ldap.bind_password', 'smb.password', 'smtp.password']);
  });

  it('tout réglage dont le nom évoque un secret est déclaré secret (chiffré, jamais journalisé)', () => {
    const suspicious = (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).filter((key) =>
      /pass|secret|pwd|(^|_)(key|cle)($|_)/i.test(splitConfigKey(key).name),
    );
    expect(suspicious.filter((key) => CONFIG_REGISTRY[key].type !== 'secret')).toEqual([]);
  });

  it.each(SECRET_KEYS)('%s : premier enregistrement, changement — seulement « modifié »', async (key) => {
    const { category, name } = splitConfigKey(key);
    for (const before of [null, 'Ancien-S3cret!']) {
      const { service, journal } = setup({ [name]: before });
      await service.update(category, { [name]: 'Nouveau-S3cret!' }, actor);
      expect(journal()).toContain(`${CONFIG_REGISTRY[key].label} : modifié`);
      expect(journal()).not.toMatch(/S3cret/i);
    }
  });

  it.each(SECRET_KEYS)('%s : le masque renvoyé tel quel ne remplace pas le secret en place', async (key) => {
    const { category, name } = splitConfigKey(key);
    const { prisma, service, journal } = setup({ [name]: 'En-Place-S3cret' });
    await service.update(category, { [name]: SECRET_MASK }, actor);
    expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    expect(journal()).toBe('[]');
  });

  it.each(SECRET_KEYS)('%s : une variante de casse du nom est refusée, sans répéter la valeur', async (key) => {
    const { category, name } = splitConfigKey(key);
    for (const variant of [name.toUpperCase(), name[0].toUpperCase() + name.slice(1)]) {
      const { prisma, service } = setup({});
      const error = await service.update(category, { [variant]: 'Fuite-S3cret' }, actor).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      expect(JSON.stringify((error as AppException).getResponse())).not.toMatch(/S3cret/);
      expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    }
  });

  it('un enregistrement de toute la rubrique ne journalise que les réglages non secrets en clair', async () => {
    const { service, journal } = setup({ host: 'old.livio.fr', user: 'svc', password: 'Ancien-S3cret' });
    await service.update('smtp', { host: 'smtp.livio.fr', user: 'svc-bons', password: 'Nouveau-S3cret', port: '587' }, actor);
    expect(journal()).toContain('smtp.livio.fr');
    expect(journal()).toContain('Mot de passe : modifié');
    expect(journal()).not.toMatch(/S3cret/);
  });
});
