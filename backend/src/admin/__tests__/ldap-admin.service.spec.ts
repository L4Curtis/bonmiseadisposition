import type { Mock } from 'vitest';
import { LdapAdminService } from '../ldap-admin.service';
import { AuditService } from '../../audit/audit.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

const DEPARTED_HOLDER = {
  bon: {
    dateMiseDisposition: new Date('2026-01-10'),
    dateRestitution: null,
    collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT', active: false },
    filiale: { id: 'f-1', displayName: 'Paris' },
  },
};

describe('LdapAdminService.deactivateAll', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let notificationService: { sendDepartureAlert: Mock };
  let service: LdapAdminService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    // Aucun compte désactivé ne détient de matériel, sauf mention contraire.
    prisma.bonEquipment.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    notificationService = { sendDepartureAlert: vi.fn().mockResolvedValue(false) };
    service = new LdapAdminService(prisma as never, new AuditService(prisma as never), notificationService as never);
  });

  it('ne désactive que les collaborateurs venus de l’annuaire, jamais l’appelant, et le trace', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.deactivateAll('admin-1', '10.0.0.5')).resolves.toEqual({ deactivated: 3 });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { lastLdapSync: { not: null }, role: 'collaborator', active: true, id: { not: 'admin-1' } },
      data: { active: false },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'ldap_users_deactivated', userId: 'admin-1', ipAddress: '10.0.0.5', details: { count: 3 } },
    });
  });

  it('alerte l’équipe quand un compte désactivé détient encore du matériel', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.bonEquipment.findMany.mockResolvedValue([DEPARTED_HOLDER]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);
    notificationService.sendDepartureAlert.mockResolvedValue(true);

    await service.deactivateAll('admin-1');

    expect(notificationService.sendDepartureAlert).toHaveBeenCalledWith([expect.objectContaining({ collaborateurId: 'u-1' })]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'departure_notified', details: { collaborateurId: 'u-1', equipmentCount: 1 } },
    });
  });

  it('ne réalerte pas une personne déjà signalée depuis sa désactivation', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.bonEquipment.findMany.mockResolvedValue([DEPARTED_HOLDER]);
    prisma.auditLog.findMany.mockResolvedValue([{ details: { collaborateurId: 'u-1' }, createdAt: new Date('2026-09-02') }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);

    await service.deactivateAll('admin-1');

    expect(notificationService.sendDepartureAlert).not.toHaveBeenCalled();
  });

  it('ne fait pas échouer la désactivation quand l’alerte échoue', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.bonEquipment.findMany.mockRejectedValue(new Error('boom'));

    await expect(service.deactivateAll('admin-1')).resolves.toEqual({ deactivated: 1 });
  });
});
