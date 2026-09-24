import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { AppConfigService } from '../../config/config.service';
import { EncryptionService } from '../../config/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockEncryptionService } from '../../common/__tests__/helpers/mock-services';
import type { Mock } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-001' });
const mockVerify = vi.fn().mockResolvedValue(true);

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    verify: mockVerify,
    sendMail: mockSendMail,
  })),
}));

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let encryption: ReturnType<typeof createMockEncryptionService>;
  let notificationService: { sendDepartureAlert: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrismaService();
    // Not part of the shared mock helper (out of this lot's scope) — added
    // locally since unlockUser() is the only consumer in this codebase so far.
    (prisma.auditLog as unknown as Record<string, Mock>).deleteMany = vi.fn();
    configService = createMockConfigService();
    encryption = createMockEncryptionService();
    // Lot D1 : purgeLdapUsers délègue l'alerte « départ avec matériel » à
    // NotificationService — mockée ici, testée en détail dans
    // departure-notifications.spec.ts et notification.service.spec.ts.
    notificationService = { sendDepartureAlert: vi.fn().mockResolvedValue(false) };
    service = new AdminService(
      configService as unknown as AppConfigService,
      encryption as unknown as EncryptionService,
      prisma as unknown as PrismaService,
      notificationService as unknown as NotificationService,
    );
  });

  // ─── testSmtp ────────────────────────────────────────────────────────────────

  describe('testSmtp', () => {
    it('fails clearly when smtp.from is not configured and a test email is requested (no fictitious sender)', async () => {
      configService.set('smtp', 'host', 'smtp.exemple.fr');
      configService.set('smtp', 'port', '587');
      // smtp.from intentionally left unset

      const result = await service.testSmtp('dest@exemple.fr');

      expect(result).toEqual({ success: false, message: 'Expéditeur SMTP (smtp.from) non configuré' });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does not require smtp.from for a connection-only test (no testEmail)', async () => {
      configService.set('smtp', 'host', 'smtp.exemple.fr');
      configService.set('smtp', 'port', '587');

      const result = await service.testSmtp();

      expect(result.success).toBe(true);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sends the test email from the configured smtp.from', async () => {
      configService.set('smtp', 'host', 'smtp.exemple.fr');
      configService.set('smtp', 'port', '587');
      configService.set('smtp', 'from', 'it@exemple.fr');

      const result = await service.testSmtp('dest@exemple.fr');

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'it@exemple.fr', to: 'dest@exemple.fr' }),
      );
    });
  });

  // ─── bulkSetConfig ───────────────────────────────────────────────────────────

  describe('bulkSetConfig', () => {
    it('ignores an empty value for an encrypted key instead of overwriting the secret (LOT C bug #9)', async () => {
      await service.bulkSetConfig('ldap', { bind_password: '', url: 'ldap://dc.exemple.fr' }, ['bind_password']);

      const upsertedKeys = prisma.appConfig.upsert.mock.calls.map(
        (call) => (call[0] as { where: { category_key: { key: string } } }).where.category_key.key,
      );
      expect(upsertedKeys).not.toContain('bind_password');
      expect(upsertedKeys).toContain('url');
    });

    it('still writes a non-empty value for an encrypted key', async () => {
      await service.bulkSetConfig('ldap', { bind_password: 'secret' }, ['bind_password']);

      expect(prisma.appConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category_key: { category: 'ldap', key: 'bind_password' } },
          update: expect.objectContaining({ encrypted: true }),
        }),
      );
    });
  });

  // ─── purgeLdapUsers ──────────────────────────────────────────────────────────

  describe('purgeLdapUsers', () => {
    beforeEach(() => {
      // Chemin nominal de l'alerte départ (lot D1) : aucun compte désactivé ne
      // détient de matériel par défaut — les tests ci-dessous surchargent ces
      // mocks quand ils veulent exercer l'envoi effectif. Sans ce défaut, le
      // chemin non mocké journalise une erreur (rows is not iterable) même
      // quand le test réussit — un test vert ne doit jamais crier dans les logs.
      prisma.bonEquipment.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('only deactivates LDAP-synced collaborators, excluding the caller (LOT C bug #5)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.purgeLdapUsers('current-admin-id');

      expect(result).toEqual({ deactivated: 3 });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          lastLdapSync: { not: null },
          role: 'collaborator',
          active: true,
          id: { not: 'current-admin-id' },
        },
        data: { active: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'ldap_users_deactivated' }) }),
      );
    });

    // ─── Alerte départ (lot D1) : même événement que la synchro LDAP ──────────

    it('déclenche l\'alerte départ pour les comptes désactivés qui détiennent encore du matériel', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.findMany.mockResolvedValue([
        {
          bon: {
            dateMiseDisposition: new Date('2026-01-10'),
            dateRestitution: null,
            collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT', active: false },
            filiale: { id: 'f-1', displayName: 'Paris' },
          },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);
      notificationService.sendDepartureAlert.mockResolvedValue(true);

      await service.purgeLdapUsers('current-admin-id');

      expect(notificationService.sendDepartureAlert).toHaveBeenCalledWith([
        expect.objectContaining({ collaborateurId: 'u-1' }),
      ]);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: { action: 'departure_notified', details: { collaborateurId: 'u-1', equipmentCount: 1 } },
      });
    });

    it('ne renvoie pas deux fois pour la même personne déjà notifiée depuis sa désactivation', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.findMany.mockResolvedValue([
        {
          bon: {
            dateMiseDisposition: new Date('2026-01-10'),
            dateRestitution: null,
            collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT', active: false },
            filiale: { id: 'f-1', displayName: 'Paris' },
          },
        },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { details: { collaborateurId: 'u-1' }, createdAt: new Date('2026-09-02') },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);

      await service.purgeLdapUsers('current-admin-id');

      expect(notificationService.sendDepartureAlert).not.toHaveBeenCalled();
    });

    it('ne fait pas échouer la purge quand l\'alerte départ échoue (résultat renvoyé normalement)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.findMany.mockRejectedValue(new Error('boom'));

      const result = await service.purgeLdapUsers('current-admin-id');

      expect(result).toEqual({ deactivated: 1 });
    });
  });

  // ─── unlockUser ──────────────────────────────────────────────────────────────

  describe('unlockUser', () => {
    it('removes recent login_local_failed entries for the target email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'target-id', email: 'locked@exemple.fr' });
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 7 });

      const result = await service.unlockUser('target-id', 'admin-id');

      expect(result).toEqual({ unlocked: true, removed: 7 });
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userEmail: 'locked@exemple.fr', action: 'login_local_failed' }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'user_unlocked' }) }),
      );
    });

    it('throws NotFoundException for an unknown user id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.unlockUser('nope', 'admin-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── changeUserRole ──────────────────────────────────────────────────────────

  describe('changeUserRole', () => {
    it('refuse de modifier son propre rôle', async () => {
      await expect(
        service.changeUserRole('admin-1', 'technician', { id: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour un utilisateur inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changeUserRole('nope', 'technician', { id: 'admin-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuse de retirer le dernier administrateur actif', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'seul.admin@exemple.fr',
        role: 'admin',
        active: true,
      });
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.changeUserRole('target-1', 'technician', { id: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      // La cible est exclue du comptage : on compte les AUTRES admins actifs.
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: 'admin', active: true, id: { not: 'target-1' } },
      });
    });

    it("autorise de rétrograder un admin déjà désactivé sans consulter la garde", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'ancien.admin@exemple.fr',
        role: 'admin',
        active: false,
      });
      prisma.user.update.mockResolvedValue({ id: 'target-1', role: 'collaborator', isItStaff: false });

      const result = await service.changeUserRole('target-1', 'collaborator', { id: 'admin-1' });

      expect(result).toEqual({ id: 'target-1', role: 'collaborator', isItStaff: false });
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it("autorise de retirer un admin quand un autre admin actif reste", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'un.admin@exemple.fr',
        role: 'admin',
        active: true,
      });
      prisma.user.count.mockResolvedValue(2);
      prisma.user.update.mockResolvedValue({ id: 'target-1', role: 'technician', isItStaff: true });

      const result = await service.changeUserRole('target-1', 'technician', { id: 'admin-1' });

      expect(result).toEqual({ id: 'target-1', role: 'technician', isItStaff: true });
    });

    it('promeut un collaborateur en direction (isItStaff:false) et journalise l’audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-2',
        email: 'collab@exemple.fr',
        role: 'collaborator',
        active: true,
      });
      prisma.user.update.mockResolvedValue({ id: 'target-2', role: 'direction', isItStaff: false });

      const result = await service.changeUserRole('target-2', 'direction', { id: 'admin-1' });

      expect(result).toEqual({ id: 'target-2', role: 'direction', isItStaff: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-2' },
        data: { role: 'direction', isItStaff: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'user_role_changed',
            details: { targetEmail: 'collab@exemple.fr', from: 'collaborator', to: 'direction' },
          }),
        }),
      );
    });

    it('promeut un utilisateur en technician (isItStaff:true)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target-3',
        email: 'futur.tech@exemple.fr',
        role: 'collaborator',
        active: true,
      });
      prisma.user.update.mockResolvedValue({ id: 'target-3', role: 'technician', isItStaff: true });

      const result = await service.changeUserRole('target-3', 'technician', { id: 'admin-1' });

      expect(result.isItStaff).toBe(true);
    });
  });

  // ─── getConfigHealth ─────────────────────────────────────────────────────────

  describe('getConfigHealth', () => {
    it('interroge uniquement les catégories de configuration couvertes (jamais "system")', async () => {
      prisma.appConfig.findMany.mockResolvedValue([]);

      await service.getConfigHealth();

      expect(prisma.appConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: { in: expect.arrayContaining(['general', 'smtp', 'ldap', 'entra', 'smb', 'rappels', 'tokens', 'timestamp', 'retention']) } },
        }),
      );
      const calledWith = prisma.appConfig.findMany.mock.calls[0][0] as { where: { category: { in: string[] } } };
      expect(calledWith.where.category.in).not.toContain('system');
    });

    it('renvoie une section par catégorie couverte, sans jamais exposer un secret', async () => {
      prisma.appConfig.findMany.mockResolvedValue([
        { category: 'smtp', key: 'host', value: 'smtp.exemple.fr', updatedAt: new Date('2026-02-01T00:00:00Z') },
        { category: 'smtp', key: 'password', value: 'ENCRYPTED:top-secret-value', updatedAt: new Date('2026-02-01T00:00:00Z') },
      ]);

      const result = await service.getConfigHealth();

      expect(result.sections).toHaveLength(9);
      const smtp = result.sections.find((s) => s.key === 'smtp');
      expect(smtp?.state).toBe('incomplet'); // port et from manquants
      expect(JSON.stringify(result)).not.toContain('top-secret-value');
    });
  });

  // ─── ensureNonLocalAdminExists ───────────────────────────────────────────────

  describe('ensureNonLocalAdminExists', () => {
    it('resolves when at least one active non-local admin exists', async () => {
      prisma.user.count.mockResolvedValue(1);

      await expect(service.ensureNonLocalAdminExists()).resolves.toBeUndefined();
    });

    it('throws BadRequestException when no active non-local admin exists (LOT C bug #11)', async () => {
      prisma.user.count.mockResolvedValue(0);

      await expect(service.ensureNonLocalAdminExists()).rejects.toThrow(BadRequestException);
    });
  });
});
