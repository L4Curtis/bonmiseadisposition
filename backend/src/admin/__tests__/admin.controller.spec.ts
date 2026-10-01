import type { Mock } from 'vitest';
import { AdminController } from '../admin.controller';
import { ConfigController } from '../config.controller';
import { AdminLdapController } from '../admin-ldap.controller';
import { AdminSmbController } from '../admin-smb.controller';
import { AppException } from '../../common/errors';
import { ConfigRegistryService } from '../../config/config-registry.service';
import { createMockConfigService, createMockSmbService } from '../../common/__tests__/helpers/mock-services';
import { AuthUser } from '../../auth/auth-user.interface';

const adminUser: AuthUser = {
  id: 'admin-1',
  samAccountName: 'admin.livio',
  displayName: 'Admin Livio',
  email: 'admin@livio.fr',
  department: null,
  company: null,
  title: null,
  filialeId: null,
  filiale: null,
  isItStaff: true,
  role: 'admin',
  isLocalAccount: false,
  mustChangePassword: false,
  active: true,
};

/** Requête Express minimale : adresse du client et navigateur. */
const request = { ip: '10.0.0.5', get: (name: string) => (name === 'user-agent' ? 'Chrome' : undefined) } as never;

describe('AdminController (supervision)', () => {
  let notificationFailures: { getFailedNotifications: Mock };
  let monitoring: { getAdminStatus: Mock };
  let sso: { getRecent: Mock };
  let controller: AdminController;

  beforeEach(() => {
    notificationFailures = { getFailedNotifications: vi.fn().mockResolvedValue({ items: [] }) };
    monitoring = { getAdminStatus: vi.fn().mockResolvedValue({ version: 'dev', jobs: [] }) };
    sso = { getRecent: vi.fn().mockResolvedValue([{ user: 'Marie' }]) };
    controller = new AdminController(notificationFailures as never, sso as never, monitoring as never);
  });

  it('transmet la fenêtre de jours validée par le DTO', async () => {
    await controller.getFailedNotifications({ days: 7 });
    expect(notificationFailures.getFailedNotifications).toHaveBeenCalledWith(7);
  });

  it('renvoie l’état de l’application tel que le calcule la supervision', async () => {
    await expect(controller.getStatus()).resolves.toEqual({ version: 'dev', jobs: [] });
  });

  it('renvoie le diagnostic SSO à la forme de liste unique', async () => {
    await expect(controller.getSsoDiagnostic({ limit: 5 })).resolves.toEqual({
      items: [{ user: 'Marie' }],
      total: 1,
      page: 1,
      limit: 1,
      truncated: false,
    });
    expect(sso.getRecent).toHaveBeenCalledWith(5);
  });
});

describe('ConfigController', () => {
  let settings: { getHealth: Mock; getSection: Mock; update: Mock };
  let registry: { describe: Mock };
  let connectionTests: { testSmtp: Mock; testEntra: Mock };
  let ldap: { testConnection: Mock };
  let smb: ReturnType<typeof createMockSmbService>;
  let controller: ConfigController;

  beforeEach(() => {
    settings = {
      getHealth: vi.fn().mockResolvedValue({ sections: [] }),
      getSection: vi.fn().mockResolvedValue({ host: 'smtp.exemple.fr' }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    registry = { describe: vi.fn().mockResolvedValue([{ key: 'tokens.expiry_days', appliedValue: 7 }]) };
    connectionTests = {
      testSmtp: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
      testEntra: vi.fn().mockResolvedValue({ ok: false, message: 'refusé' }),
    };
    ldap = { testConnection: vi.fn().mockResolvedValue({ ok: false, message: 'Serveur injoignable' }) };
    smb = createMockSmbService();
    controller = new ConfigController(
      settings as never,
      registry as never,
      connectionTests as never,
      ldap as never,
      smb as never,
    );
  });

  it('renvoie le registre à la forme de liste unique', async () => {
    await expect(controller.getRegistry()).resolves.toEqual({
      items: [{ key: 'tokens.expiry_days', appliedValue: 7 }],
      total: 1,
      page: 1,
      limit: 1,
      truncated: false,
    });
  });

  it('enregistre une rubrique avec l’auteur, son adresse et son navigateur', async () => {
    await expect(controller.setSection('smtp', { host: 'smtp.exemple.fr' }, adminUser, request)).resolves.toEqual({ ok: true });
    expect(settings.update).toHaveBeenCalledWith('smtp', { host: 'smtp.exemple.fr' }, {
      id: 'admin-1',
      ip: '10.0.0.5',
      userAgent: 'Chrome',
    });
  });

  it('lit une rubrique et l’état de santé', async () => {
    await expect(controller.getSection('smtp')).resolves.toEqual({ host: 'smtp.exemple.fr' });
    await expect(controller.getHealth()).resolves.toEqual({ sections: [] });
  });

  it('renvoie le résultat des tests de connexion sous un seul nom de champ (`ok`)', async () => {
    await expect(controller.testLdap()).resolves.toEqual({ ok: false, message: 'Serveur injoignable' });
    await expect(controller.testEntra()).resolves.toEqual({ ok: false, message: 'refusé' });
    await expect(controller.testSmtp({ testEmail: '' })).resolves.toEqual({ ok: true, message: 'ok' });
    expect(connectionTests.testSmtp).toHaveBeenCalledWith(undefined);
    await controller.testSmb();
    expect(smb.testConnection).toHaveBeenCalled();
  });
});

describe('AdminLdapController', () => {
  let ldapService: { getSyncStatus: Mock; syncUsers: Mock };
  let ldapAdmin: { deactivateAll: Mock };
  let controller: AdminLdapController;

  beforeEach(() => {
    ldapService = {
      getSyncStatus: vi.fn().mockReturnValue({ lastSync: new Date('2026-10-01T08:00:00Z'), lastSyncSuccess: true }),
      syncUsers: vi.fn().mockResolvedValue(undefined),
    };
    ldapAdmin = { deactivateAll: vi.fn().mockResolvedValue({ deactivated: 2 }) };
    controller = new AdminLdapController(ldapService as never, ldapAdmin as never);
  });

  it('renvoie l’état de la dernière synchronisation, date en ISO', () => {
    expect(controller.getStatus()).toMatchObject({ lastSync: '2026-10-01T08:00:00.000Z', lastSyncSuccess: true });
  });

  it('lance la synchronisation sans l’attendre', () => {
    expect(controller.triggerSync()).toEqual({ ok: true, message: "Synchronisation de l'annuaire lancée." });
    expect(ldapService.syncUsers).toHaveBeenCalled();
  });

  it('désactive les comptes de l’annuaire et dit combien, dans `deactivated` et dans le message', async () => {
    await expect(controller.deactivateAll(adminUser, request)).resolves.toEqual({
      ok: true,
      message: "2 comptes de l'annuaire désactivés.",
      deactivated: 2,
    });
    expect(ldapAdmin.deactivateAll).toHaveBeenCalledWith('admin-1', '10.0.0.5');
  });

  it('le dit quand il n’y avait rien à désactiver', async () => {
    ldapAdmin.deactivateAll.mockResolvedValue({ deactivated: 0 });
    await expect(controller.deactivateAll(adminUser, request)).resolves.toMatchObject({
      message: "Aucun compte de l'annuaire à désactiver.",
      deactivated: 0,
    });
  });
});

describe('AdminSmbController', () => {
  let config: ReturnType<typeof createMockConfigService>;
  let smb: ReturnType<typeof createMockSmbService>;
  let controller: AdminSmbController;

  beforeEach(() => {
    config = createMockConfigService();
    smb = createMockSmbService();
    controller = new AdminSmbController(smb as never, new ConfigRegistryService(config as never, {}));
  });

  it('refuse les relances quand la copie réseau est désactivée (400 smb_disabled)', async () => {
    await expect(controller.retryOne('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(AppException);
    await expect(controller.retryAll()).rejects.toBeInstanceOf(AppException);
    expect(smb.retryOne).not.toHaveBeenCalled();
  });

  it('relance quand la copie réseau est activée', async () => {
    await config.set('smb', 'enabled', 'true');
    smb.retryOne.mockResolvedValue({ ok: false, message: 'La relance a échoué : partage non monté' });

    await expect(controller.retryOne('00000000-0000-4000-8000-000000000000')).resolves.toEqual({
      ok: false,
      message: 'La relance a échoué : partage non monté',
    });
    await expect(controller.retryAll()).resolves.toEqual({ retried: 0, succeeded: 0, failed: 0 });
  });

  it('renvoie l’état et les exports en échec, dates en ISO', async () => {
    smb.getStatus.mockResolvedValue({ enabled: true, total: 3, success: 2, failed: 1, pending: 0, lastSuccessAt: new Date('2026-10-01T08:00:00Z') });
    smb.getFailedExports.mockResolvedValue([
      { id: 'e1', createdAt: new Date('2026-10-01T07:00:00Z'), lastAttemptAt: null, bonReference: 'BON-2026-0001' },
    ]);

    await expect(controller.getStatus()).resolves.toMatchObject({ enabled: true, lastSuccessAt: '2026-10-01T08:00:00.000Z' });
    await expect(controller.getFailed()).resolves.toMatchObject({
      items: [{ id: 'e1', createdAt: '2026-10-01T07:00:00.000Z', lastAttemptAt: null }],
      total: 1,
    });
  });

  it('ne renvoie aucun compteur quand la copie est désactivée', async () => {
    await expect(controller.getStatus()).resolves.toEqual({ enabled: false });
  });
});
