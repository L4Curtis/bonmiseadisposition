import { ForbiddenException } from '@nestjs/common';
import { verifyCollaboratorAccess } from '../bons-access';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { AuthUser } from '../../auth/auth-user.interface';
import type { Mock } from 'vitest';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 'user-1', email: 'user@exemple.fr', role: 'collaborator', ...overrides } as AuthUser;
}

describe('verifyCollaboratorAccess', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
  });

  it('autorise un collaborateur propriétaire du bon (cas nominal)', async () => {
    (prisma.bon.findUnique as Mock).mockResolvedValue({ collaborateurId: 'user-1' });
    await expect(verifyCollaboratorAccess(prisma as never, 'bon-1', user())).resolves.toBeUndefined();
  });

  it('refuse un collaborateur qui ne possède pas le bon', async () => {
    (prisma.bon.findUnique as Mock).mockResolvedValue({ collaborateurId: 'someone-else' });
    await expect(verifyCollaboratorAccess(prisma as never, 'bon-1', user())).rejects.toThrow(ForbiddenException);
  });

  it('autorise admin/technician sans consulter le bon (accès transverse IT)', async () => {
    await verifyCollaboratorAccess(prisma as never, 'bon-1', user({ role: 'admin' }));
    expect(prisma.bon.findUnique).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur absent (falsy)', async () => {
    await expect(
      verifyCollaboratorAccess(prisma as never, 'bon-1', undefined as unknown as AuthUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('laisse passer un bon inconnu (le 404 est produit par le lookup du handler, pas ici)', async () => {
    (prisma.bon.findUnique as Mock).mockResolvedValue(null);
    await expect(verifyCollaboratorAccess(prisma as never, 'bon-inconnu', user())).resolves.toBeUndefined();
  });
});
