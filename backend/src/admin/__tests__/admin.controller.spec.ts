import { BadRequestException } from '@nestjs/common';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';
import { LdapService } from '../../ldap/ldap.service';
import { AppConfigService } from '../../config/config.service';
import { SmbService } from '../../smb/smb.service';
import { NotificationFailuresService } from '../notification-failures.service';
import { SsoDiagnosticService } from '../sso-diagnostic.service';
import { createMockConfigService, createMockSmbService } from '../../common/__tests__/helpers/mock-services';
import { AuthUser } from '../../auth/auth-user.interface';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: {
    bulkSetConfig: jest.Mock;
    getConfigSection: jest.Mock;
    changeUserRole: jest.Mock;
    ensureNonLocalAdminExists: jest.Mock;
    getConfigHealth: jest.Mock;
  };
  let ldapService: { validateLdapFilter: jest.Mock };
  let configService: ReturnType<typeof createMockConfigService>;
  let smbService: ReturnType<typeof createMockSmbService>;
  let notificationFailuresService: { getFailedNotifications: jest.Mock };

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

  beforeEach(() => {
    adminService = {
      bulkSetConfig: jest.fn().mockResolvedValue(undefined),
      getConfigSection: jest.fn().mockResolvedValue({}),
      changeUserRole: jest.fn().mockResolvedValue({ id: 'user-2', role: 'direction', isItStaff: false }),
      ensureNonLocalAdminExists: jest.fn().mockResolvedValue(undefined),
      getConfigHealth: jest.fn().mockResolvedValue({ sections: [] }),
    };
    ldapService = { validateLdapFilter: jest.fn() };
    configService = createMockConfigService();
    smbService = createMockSmbService();
    notificationFailuresService = {
      getFailedNotifications: jest.fn().mockResolvedValue({ count: 0, windowDays: 30, items: [] }),
    };

    controller = new AdminController(
      adminService as unknown as AdminService,
      ldapService as unknown as LdapService,
      configService as unknown as AppConfigService,
      smbService as unknown as SmbService,
      notificationFailuresService as unknown as NotificationFailuresService,
      { getRecent: jest.fn().mockResolvedValue([]) } as unknown as SsoDiagnosticService,
    );
  });

  // ─── setConfig — rappels.signature_overdue_days ───────────────────────────────

  describe('setConfig — rappels.signature_overdue_days', () => {
    it('refuse 0 (min 1)', async () => {
      await expect(
        controller.setConfig('rappels', { signature_overdue_days: '0' }, adminUser),
      ).rejects.toThrow(BadRequestException);
      expect(adminService.bulkSetConfig).not.toHaveBeenCalled();
    });

    it('refuse une valeur non entière', async () => {
      await expect(
        controller.setConfig('rappels', { signature_overdue_days: 'abc' }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepte une valeur >= 1', async () => {
      await controller.setConfig('rappels', { signature_overdue_days: '3' }, adminUser);

      expect(adminService.bulkSetConfig).toHaveBeenCalledWith(
        'rappels',
        expect.objectContaining({ signature_overdue_days: '3' }),
        [],
        adminUser.id,
      );
    });
  });

  // ─── setConfig — entra.direction_group_id ──────────────────────────────────────

  describe('setConfig — entra.direction_group_id', () => {
    it('accepte la clé direction_group_id (nouvelle clé autorisée)', async () => {
      await controller.setConfig('entra', { direction_group_id: 'grp-direction' }, adminUser);

      expect(adminService.bulkSetConfig).toHaveBeenCalledWith(
        'entra',
        expect.objectContaining({ direction_group_id: 'grp-direction' }),
        ['client_secret'],
        adminUser.id,
      );
    });
  });

  // ─── getConfigHealth ────────────────────────────────────────────────────────────

  describe('getConfigHealth', () => {
    it('délègue à adminService.getConfigHealth', async () => {
      const sections = [{ key: 'smtp', label: 'Email / SMTP', state: 'configure', detail: 'ok', updatedAt: null }];
      adminService.getConfigHealth.mockResolvedValue({ sections });

      const result = await controller.getConfigHealth();

      expect(adminService.getConfigHealth).toHaveBeenCalled();
      expect(result).toEqual({ sections });
    });
  });

  // ─── changeUserRole ────────────────────────────────────────────────────────────

  describe('changeUserRole', () => {
    it('délègue à adminService.changeUserRole avec l’acteur courant', async () => {
      const result = await controller.changeUserRole('user-2', { role: 'direction' }, adminUser);

      expect(adminService.changeUserRole).toHaveBeenCalledWith('user-2', 'direction', { id: 'admin-1' });
      expect(result).toEqual({ id: 'user-2', role: 'direction', isItStaff: false });
    });
  });

  // ─── getFailedNotifications ────────────────────────────────────────────────────

  describe('getFailedNotifications', () => {
    it('utilise 30 jours par défaut', async () => {
      await controller.getFailedNotifications();
      expect(notificationFailuresService.getFailedNotifications).toHaveBeenCalledWith(30);
    });

    it('borne la fenêtre à 365 jours au maximum', async () => {
      await controller.getFailedNotifications('9999');
      expect(notificationFailuresService.getFailedNotifications).toHaveBeenCalledWith(365);
    });

    it('borne la fenêtre à 1 jour au minimum', async () => {
      await controller.getFailedNotifications('-5');
      expect(notificationFailuresService.getFailedNotifications).toHaveBeenCalledWith(1);
    });

    it('retombe sur 30 jours pour une valeur non numérique', async () => {
      await controller.getFailedNotifications('abc');
      expect(notificationFailuresService.getFailedNotifications).toHaveBeenCalledWith(30);
    });
  });
});
