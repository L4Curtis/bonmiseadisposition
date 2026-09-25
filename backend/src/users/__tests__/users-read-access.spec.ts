/**
 * Lectures d'utilisateurs ouvertes au technicien : elles ne renvoient que ce
 * dont l'écran a besoin, jamais le cachet d'une filiale. La même requête contre
 * une vraie base : users-it-staff.real-db.spec.ts.
 */
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('UsersService — lectures ouvertes au technicien', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('findItStaff : admins et techniciens actifs, réduits à { id, displayName }, triés par nom', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.findItStaff();
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['admin', 'technician'] }, active: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  });

  it('search et findOne ne chargent de la filiale que son identité, jamais son cachet', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue(null);
    await service.search('dupont');
    await service.findOne('u-1');

    const selects = [
      prisma.user.findMany.mock.calls[0][0].select,
      prisma.user.findUnique.mock.calls[0][0].select,
    ] as Array<{ filiale: unknown }>;
    for (const select of selects) {
      expect(select.filiale).toEqual({ select: { id: true, name: true, displayName: true, active: true } });
    }
  });
});
