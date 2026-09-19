import { Logger } from '@nestjs/common';
import { deactivateAbsentLdapUsers } from '../ldap-deactivation';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

const asMock = (fn: unknown): jest.Mock => fn as jest.Mock;

describe('deactivateAbsentLdapUsers', () => {
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as unknown as Logger;

  it('deactivates absent accounts when under the 20% threshold (cas nominal)', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.user.count).mockResolvedValueOnce(2).mockResolvedValueOnce(100);
    asMock(prisma.user.updateMany).mockResolvedValue({ count: 2 });

    const result = await deactivateAbsentLdapUsers(prisma as never, logger, new Date());

    expect(result).toEqual({ aborted: false, abortMessage: null });
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });

  it('aborts when more than 20% AND at least 5 accounts would be deactivated (cas limite)', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.user.count).mockResolvedValueOnce(30).mockResolvedValueOnce(100);

    const result = await deactivateAbsentLdapUsers(prisma as never, logger, new Date());

    expect(result.aborted).toBe(true);
    expect(result.abortMessage).toContain('Sync interrompue');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ldap_sync_aborted' }) }),
    );
  });

  it('does not abort when the ratio is high but the absolute count is below the floor of 5 (cas limite)', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.user.count).mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    asMock(prisma.user.updateMany).mockResolvedValue({ count: 3 });

    const result = await deactivateAbsentLdapUsers(prisma as never, logger, new Date());

    expect(result.aborted).toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
});
