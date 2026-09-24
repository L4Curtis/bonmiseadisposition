import { Logger } from '@nestjs/common';
import { upsertLdapUsers } from '../ldap-user-upsert';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const asMock = (fn: unknown): Mock => fn as Mock;

describe('upsertLdapUsers', () => {
  const logger = { warn: vi.fn(), error: vi.fn(), log: vi.fn() } as unknown as Logger;
  const ldapUser = {
    sAMAccountName: 'jdupont',
    displayName: 'Jean Dupont',
    mail: 'Jean.Dupont@Exemple.fr',
    department: undefined,
    company: undefined,
    title: undefined,
  };

  it('normalizes the email and upserts by sAMAccountName when no match exists (cas nominal)', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.filiale.findMany).mockResolvedValue([]);
    asMock(prisma.user.findFirst).mockResolvedValue(null);
    asMock(prisma.user.upsert).mockResolvedValue({});

    const result = await upsertLdapUsers(prisma as never, logger, [ldapUser]);

    expect(result.skipped).toBe(0);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { samAccountName: 'jdupont' },
        update: expect.objectContaining({ email: 'jean.dupont@exemple.fr' }),
      }),
    );
  });

  it('never overwrites a manual account matched by email (cas limite)', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.filiale.findMany).mockResolvedValue([]);
    asMock(prisma.user.findFirst).mockResolvedValue({
      id: 'manual-1',
      samAccountName: 'manuel.jean.dupont',
      isManualAccount: true,
    });

    const result = await upsertLdapUsers(prisma as never, logger, [ldapUser]);

    expect(result.skipped).toBe(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });
});
