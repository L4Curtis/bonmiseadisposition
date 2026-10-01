import { BadRequestException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { ConfigSettingsService } from '../config-settings.service';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';

describe('ConfigSettingsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof createMockConfigService>;
  let ldap: { validateLdapFilter: Mock };
  let service: ConfigSettingsService;
  const actor = { id: 'admin-1', ip: '10.0.0.5', userAgent: 'Chrome' };

  /** Valeurs déjà en base pour la rubrique lue (secrets déchiffrés). */
  function stored(values: Record<string, string | null>): void {
    config.getAll.mockResolvedValue(values);
  }

  function auditCalls(): unknown[] {
    return prisma.auditLog.create.mock.calls.map((call) => (call[0] as { data: unknown }).data);
  }

  function upsertedKeys(): string[] {
    return prisma.appConfig.upsert.mock.calls.map(
      (call) => (call[0] as { where: { category_key: { key: string } } }).where.category_key.key,
    );
  }

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = createMockConfigService();
    ldap = { validateLdapFilter: vi.fn() };
    stored({});
    service = new ConfigSettingsService(
      config as never,
      createMockEncryptionService() as never,
      prisma as never,
      new AuditService(prisma as never),
      ldap as never,
    );
  });

  describe('update', () => {
    it('enregistre la rubrique et trace le changement avec l’ancienne et la nouvelle valeur', async () => {
      stored({ host: 'smtp.ancien.fr' });

      await service.update('smtp', { host: 'smtp.nouveau.fr', port: '587' }, actor);

      expect(upsertedKeys()).toEqual(['host', 'port']);
      expect(auditCalls()).toEqual([
        {
          action: 'config_updated',
          userId: 'admin-1',
          ipAddress: '10.0.0.5',
          userAgent: 'Chrome',
          details: {
            category: 'smtp',
            section: 'Email / SMTP',
            summary: 'Serveur SMTP : « smtp.ancien.fr » → « smtp.nouveau.fr » ; Port : vide → « 587 »',
            changes: [
              { key: 'smtp.host', label: 'Serveur SMTP', from: 'smtp.ancien.fr', to: 'smtp.nouveau.fr' },
              { key: 'smtp.port', label: 'Port', from: null, to: '587' },
            ],
          },
        },
      ]);
      expect(config.invalidateCache).toHaveBeenCalledWith('smtp');
    });

    it('ne note un secret que « modifié », sans jamais sa valeur, et le chiffre en base', async () => {
      stored({ password: 'ancien-mot-de-passe' });

      await service.update('smtp', { password: 'nouveau-mot-de-passe' }, actor);

      const journal = JSON.stringify(auditCalls());
      expect(journal).toContain('Mot de passe : modifié');
      expect(journal).not.toContain('mot-de-passe');
      expect(prisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ value: 'encrypted:nouveau-mot-de-passe', encrypted: true }),
        }),
      );
    });

    it('ignore un secret envoyé vide au lieu d’effacer celui qui est en place', async () => {
      stored({ bind_password: 'secret' });

      await service.update('ldap', { bind_password: '', url: 'ldap://dc.exemple.fr' }, actor);

      expect(upsertedKeys()).toEqual(['url']);
      expect(JSON.stringify(auditCalls())).not.toContain('bind_password');
    });

    it('n’écrit rien au journal quand rien n’a changé', async () => {
      stored({ expiry_days: '7' });

      await service.update('tokens', { expiry_days: '7' }, actor);

      expect(auditCalls()).toEqual([]);
    });

    it('refuse une valeur hors bornes sans rien écrire', async () => {
      await expect(service.update('tokens', { expiry_days: '45' }, actor)).rejects.toBeInstanceOf(AppException);
      expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
      expect(auditCalls()).toEqual([]);
    });

    it('fait vérifier le filtre de l’annuaire par le service LDAP', async () => {
      await service.update('ldap', { user_filter: '(objectClass=person)' }, actor);

      expect(ldap.validateLdapFilter).toHaveBeenCalledWith('(objectClass=person)');
    });

    it('refuse de couper la connexion locale sans administrateur SSO actif', async () => {
      prisma.user.count.mockResolvedValue(0);

      await expect(service.update('general', { local_auth_enabled: 'false' }, actor)).rejects.toThrow(BadRequestException);
      expect(prisma.appConfig.upsert).not.toHaveBeenCalled();
    });

    it('coupe la connexion locale quand un administrateur SSO actif existe', async () => {
      prisma.user.count.mockResolvedValue(1);

      await service.update('general', { local_auth_enabled: 'false' }, actor);

      expect(upsertedKeys()).toEqual(['local_auth_enabled']);
    });
  });

  describe('getSection', () => {
    it('renvoie les valeurs saisies, secrets masqués', async () => {
      stored({ host: 'smtp.exemple.fr', password: '••••••••' });

      await expect(service.getSection('smtp')).resolves.toEqual({ host: 'smtp.exemple.fr', password: '••••••••' });
      expect(config.getAll).toHaveBeenCalledWith('smtp', { maskSecrets: true });
    });

    it('refuse une rubrique inconnue', async () => {
      await expect(service.getSection('system')).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('getHealth', () => {
    it('interroge les seules rubriques de l’écran (jamais « system ») et ne renvoie aucun secret', async () => {
      prisma.appConfig.findMany.mockResolvedValue([
        { category: 'smtp', key: 'host', value: 'smtp.exemple.fr', updatedAt: new Date('2026-02-01T00:00:00Z') },
        { category: 'smtp', key: 'password', value: 'ENCRYPTED:top-secret-value', updatedAt: new Date('2026-02-01T00:00:00Z') },
      ]);

      const result = await service.getHealth();

      const where = (prisma.appConfig.findMany.mock.calls[0][0] as { where: { category: { in: string[] } } }).where;
      expect(where.category.in).not.toContain('system');
      expect(result.sections).toHaveLength(9);
      expect(result.sections.find((s) => s.key === 'smtp')?.state).toBe('incomplet');
      expect(JSON.stringify(result)).not.toContain('top-secret-value');
    });
  });
});
