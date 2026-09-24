import { BadRequestException } from '@nestjs/common';
import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';
import { LdapService } from '../../ldap/ldap.service';
import { AppConfigService } from '../../config/config.service';
import { SmbService } from '../../smb/smb.service';
import { NotificationFailuresService } from '../notification-failures.service';
import { SsoDiagnosticService } from '../sso-diagnostic.service';
import { MonitoringService } from '../../monitoring/monitoring.service';
import { createMockConfigService, createMockSmbService } from '../../common/__tests__/helpers/mock-services';
import { AuthUser } from '../../auth/auth-user.interface';
import type { Mock } from 'vitest';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: {
    bulkSetConfig: Mock;
    getConfigSection: Mock;
    changeUserRole: Mock;
    ensureNonLocalAdminExists: Mock;
    getConfigHealth: Mock;
  };
  let ldapService: { validateLdapFilter: Mock };
  let configService: ReturnType<typeof createMockConfigService>;
  let smbService: ReturnType<typeof createMockSmbService>;
  let notificationFailuresService: { getFailedNotifications: Mock };
  let monitoringService: { getAdminStatus: Mock };

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
      bulkSetConfig: vi.fn().mockResolvedValue(undefined),
      getConfigSection: vi.fn().mockResolvedValue({}),
      changeUserRole: vi.fn().mockResolvedValue({ id: 'user-2', role: 'direction', isItStaff: false }),
      ensureNonLocalAdminExists: vi.fn().mockResolvedValue(undefined),
      getConfigHealth: vi.fn().mockResolvedValue({ sections: [] }),
    };
    ldapService = { validateLdapFilter: vi.fn() };
    configService = createMockConfigService();
    smbService = createMockSmbService();
    notificationFailuresService = {
      getFailedNotifications: vi.fn().mockResolvedValue({ count: 0, windowDays: 30, items: [] }),
    };
    monitoringService = {
      getAdminStatus: vi.fn().mockResolvedValue({
        version: 'dev', commit: 'dev', uptimeSeconds: 0, database: 'ok', jobs: [],
      }),
    };

    controller = new AdminController(
      adminService as unknown as AdminService,
      ldapService as unknown as LdapService,
      configService as unknown as AppConfigService,
      smbService as unknown as SmbService,
      notificationFailuresService as unknown as NotificationFailuresService,
      { getRecent: vi.fn().mockResolvedValue([]) } as unknown as SsoDiagnosticService,
      monitoringService as unknown as MonitoringService,
    );
  });

  // ─── status (lot A5, supervision) ───────────────────────────────────────────

  describe('getStatus', () => {
    it('délègue à MonitoringService.getAdminStatus() et renvoie son résultat tel quel', async () => {
      const status = {
        version: '1.2.3', commit: 'abc1234', uptimeSeconds: 42, database: 'ok' as const,
        jobs: [{ job: 'ldap-sync', label: 'Synchronisation LDAP', schedule: 'toutes les 6 h', lastStartedAt: null, lastFinishedAt: null, lastStatus: null, lastError: null, lastDurationMs: null, late: false }],
      };
      monitoringService.getAdminStatus.mockResolvedValue(status);

      const result = await controller.getStatus();

      expect(monitoringService.getAdminStatus).toHaveBeenCalled();
      expect(result).toEqual(status);
    });
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
