import { NotFoundException } from '@nestjs/common';
import { UserAccountsService } from '../user-accounts.service';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigRegistryService } from '../../config/config-registry.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

const ADMIN = { id: 'admin-1' };
const NOW = new Date('2026-10-01T10:00:00Z');

function directoryUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ad-1',
    email: 'parti@exemple.fr',
    displayName: 'Paul PARTI',
    role: 'collaborator',
    active: true,
    isManualAccount: false,
    isLocalAccount: false,
    ...overrides,
  };
}

/** Réglages de l'annuaire : actif = coché ET adresse renseignée. */
function settings(ldapEnabled: boolean, ldapUrl: string | null) {
  return {
    getBool: vi.fn().mockResolvedValue(ldapEnabled),
    getString: vi.fn().mockResolvedValue(ldapUrl),
  };
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number): Promise<void> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppException);
  expect((err as AppException).code).toBe(code);
  expect((err as AppException).getStatus()).toBe(status);
}

describe('UserAccountsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof settings>;
  let service: UserAccountsService;

  function build(ldapEnabled = false, ldapUrl: string | null = null) {
    config = settings(ldapEnabled, ldapUrl);
    const typedPrisma = prisma as unknown as PrismaService;
    service = new UserAccountsService(
      typedPrisma,
      new AuditService(typedPrisma),
      config as unknown as ConfigRegistryService,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    prisma = createMockPrismaService();
    prisma.auditLog.create.mockResolvedValue({});
    build();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Rôle ───────────────────────────────────────────────────────────────────

  describe('changeRole', () => {
    it('refuse de modifier son propre rôle (own_account)', async () => {
      await expectAppError(service.changeRole('admin-1', 'technician', ADMIN), 'own_account', 400);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('404 pour un compte inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.changeRole('nope', 'technician', ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('refuse de retirer le dernier administrateur actif (last_admin), la cible exclue du comptage', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 't-1', role: 'admin' }));
      prisma.user.count.mockResolvedValue(0);

      await expectAppError(service.changeRole('t-1', 'technician', ADMIN), 'last_admin', 409);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: 'admin', active: true, id: { not: 't-1' } } });
    });

    it('rétrograde un admin déjà désactivé sans consulter la garde', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 't-1', role: 'admin', active: false }));
      prisma.user.update.mockResolvedValue({ id: 't-1', role: 'collaborator', isItStaff: false });

      const result = await service.changeRole('t-1', 'collaborator', ADMIN);

      expect(result).toEqual({ id: 't-1', role: 'collaborator', isItStaff: false });
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('promeut en direction (isItStaff faux) et trace user_role_changed', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 't-2' }));
      prisma.user.update.mockResolvedValue({ id: 't-2', role: 'direction', isItStaff: false });

      const result = await service.changeRole('t-2', 'direction', ADMIN, '10.0.0.1');

      expect(result).toEqual({ id: 't-2', role: 'direction', isItStaff: false });
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 't-2' }, data: { role: 'direction', isItStaff: false } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'user_role_changed',
          userId: 'admin-1',
          details: { targetUserId: 't-2', targetEmail: 'parti@exemple.fr', from: 'collaborator', to: 'direction' },
          ipAddress: '10.0.0.1',
        },
      });
    });
  });

  // ─── Déverrouillage ─────────────────────────────────────────────────────────

  describe('unlock', () => {
    it('n’efface rien du journal : écrit user_unlocked avec l’adresse du compte', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 'loc-1', email: 'locked@exemple.fr', isLocalAccount: true }));
      prisma.auditLog.count.mockResolvedValue(7);

      const result = await service.unlock('loc-1', ADMIN);

      expect(result).toEqual({ unlocked: true, failedAttempts: 7 });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'user_unlocked',
          userId: 'admin-1',
          details: { targetUserId: 'loc-1', targetEmail: 'locked@exemple.fr' },
        },
      });
      // Seuls les échecs de la fenêtre de 30 minutes sont comptés.
      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          userEmail: 'locked@exemple.fr',
          action: 'login_local_failed',
          createdAt: { gte: new Date('2026-10-01T09:30:00Z') },
        },
      });
    });

    it('marque l’adresse normalisée, celle que la connexion trace et compare', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 'loc-2', email: ' Locked@Exemple.FR ', isLocalAccount: true }));
      prisma.auditLog.count.mockResolvedValue(0);

      await service.unlock('loc-2', ADMIN);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ details: { targetUserId: 'loc-2', targetEmail: 'locked@exemple.fr' } }),
      });
    });

    it('404 pour un compte inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.unlock('nope', ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('refuse un compte sans adresse (rien à déverrouiller)', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ email: null }));
      await expectAppError(service.unlock('ad-1', ADMIN), 'no_local_login', 400);
    });
  });

  // ─── Désactivation et réactivation (R-107) ──────────────────────────────────

  describe('setActive', () => {
    it('annuaire inactif : désactive un compte venu de l’annuaire et le trace', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser());
      prisma.user.update.mockResolvedValue({ ...directoryUser(), active: false });

      const result = await service.setActive('ad-1', false, ADMIN);

      expect(result?.active).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ad-1' }, data: { active: false } }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'user_deactivated',
          userId: 'admin-1',
          details: {
            targetUserId: 'ad-1', targetEmail: 'parti@exemple.fr', displayName: 'Paul PARTI', account: 'directory',
          },
        },
      });
    });

    it('annuaire coché mais sans adresse : considéré inactif, la désactivation passe', async () => {
      build(true, null);
      prisma.user.findUnique.mockResolvedValue(directoryUser());
      prisma.user.update.mockResolvedValue({ ...directoryUser(), active: false });

      await expect(service.setActive('ad-1', false, ADMIN)).resolves.toMatchObject({ active: false });
      expect(config.getBool).toHaveBeenCalledWith('ldap.enabled');
    });

    it('annuaire actif : refuse de toucher un compte de l’annuaire (directory_active, 409)', async () => {
      build(true, 'ldap://dc.exemple.fr');
      prisma.user.findUnique.mockResolvedValue(directoryUser());

      await expectAppError(service.setActive('ad-1', false, ADMIN), 'directory_active', 409);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('annuaire actif : ne réactive pas non plus un compte de l’annuaire (la synchronisation fait foi)', async () => {
      build(true, 'ldap://dc.exemple.fr');
      prisma.user.findUnique.mockResolvedValue(directoryUser({ active: false }));

      await expectAppError(service.setActive('ad-1', true, ADMIN), 'directory_active', 409);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('annuaire actif : un compte créé à la main reste désactivable', async () => {
      build(true, 'ldap://dc.exemple.fr');
      const manual = directoryUser({ id: 'man-1', isManualAccount: true });
      prisma.user.findUnique.mockResolvedValue(manual);
      prisma.user.update.mockResolvedValue({ ...manual, active: false });

      await service.setActive('man-1', false, ADMIN);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user_deactivated',
          details: expect.objectContaining({ account: 'manual' }),
        }),
      });
    });

    it('réactive un compte et trace user_reactivated', async () => {
      const inactive = directoryUser({ active: false });
      prisma.user.findUnique.mockResolvedValue(inactive);
      prisma.user.update.mockResolvedValue({ ...inactive, active: true });

      await service.setActive('ad-1', true, ADMIN);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'user_reactivated' }),
      });
    });

    it('état déjà atteint : renvoie le compte sans écrire ni tracer', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(directoryUser({ active: false }));
      prisma.user.findUnique.mockResolvedValueOnce({ ...directoryUser({ active: false }) });

      await service.setActive('ad-1', false, ADMIN);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('refuse de désactiver son propre compte (own_account)', async () => {
      await expectAppError(service.setActive('admin-1', false, ADMIN), 'own_account', 400);
    });

    it('refuse de désactiver le dernier administrateur actif (last_admin)', async () => {
      prisma.user.findUnique.mockResolvedValue(directoryUser({ id: 'adm-2', role: 'admin', isLocalAccount: true }));
      prisma.user.count.mockResolvedValue(0);

      await expectAppError(service.setActive('adm-2', false, ADMIN), 'last_admin', 409);
    });

    it('404 pour un compte inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setActive('nope', false, ADMIN)).rejects.toThrow(NotFoundException);
    });
  });

  describe('directoryActive', () => {
    it.each([
      [false, 'ldap://dc', false],
      [true, null, false],
      [true, '  ', false],
      [true, 'ldap://dc', true],
    ])('ldap.enabled=%s, ldap.url=%s → %s', async (enabled, url, expected) => {
      build(enabled, url);
      await expect(service.directoryActive()).resolves.toBe(expected);
    });
  });
});
