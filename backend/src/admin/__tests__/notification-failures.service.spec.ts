import { NotificationFailuresService } from '../notification-failures.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('NotificationFailuresService', () => {
  let service: NotificationFailuresService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new NotificationFailuresService(prisma as unknown as PrismaService);
  });

  it('renvoie count, windowDays et items dans la forme attendue', async () => {
    prisma.notificationLog.count.mockResolvedValue(2);
    prisma.notificationLog.findMany.mockResolvedValue([
      {
        id: 'nl-1',
        recipientEmail: 'jean.dupont@exemple.fr',
        type: 'mise_dispo_request',
        sentAt: new Date('2026-09-10T08:00:00Z'),
        errorMessage: 'SMTP timeout',
        bon: { id: 'bon-1', reference: 'BON-2026-0001' },
      },
      {
        id: 'nl-2',
        recipientEmail: 'marie.martin@exemple.fr',
        type: 'reminder',
        sentAt: new Date('2026-09-11T08:00:00Z'),
        errorMessage: null,
        bon: { id: 'bon-2', reference: 'BON-2026-0002' },
      },
    ]);

    const result = await service.getFailedNotifications();

    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.meta).toEqual({ windowDays: 30 });
    expect(result.items).toEqual([
      {
        id: 'nl-1',
        bonId: 'bon-1',
        reference: 'BON-2026-0001',
        recipient: 'jean.dupont@exemple.fr',
        type: 'mise_dispo_request',
        sentAt: '2026-09-10T08:00:00.000Z',
        error: 'SMTP timeout',
      },
      {
        id: 'nl-2',
        bonId: 'bon-2',
        reference: 'BON-2026-0002',
        recipient: 'marie.martin@exemple.fr',
        type: 'reminder',
        sentAt: '2026-09-11T08:00:00.000Z',
        error: '',
      },
    ]);
  });

  it('filtre par statut failed et sentAt dans la fenêtre demandée', async () => {
    prisma.notificationLog.count.mockResolvedValue(0);
    prisma.notificationLog.findMany.mockResolvedValue([]);

    await service.getFailedNotifications(7);

    expect(prisma.notificationLog.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'failed' }) }),
    );
    const findManyCall = prisma.notificationLog.findMany.mock.calls[0][0] as {
      where: { sentAt: { gte: Date } };
      take: number;
    };
    expect(findManyCall.take).toBe(100);
    expect(findManyCall.where.sentAt.gte).toBeInstanceOf(Date);
  });

  it('utilise 30 jours par défaut quand aucune fenêtre n\'est fournie', async () => {
    prisma.notificationLog.count.mockResolvedValue(0);
    prisma.notificationLog.findMany.mockResolvedValue([]);

    const result = await service.getFailedNotifications();

    expect(result.meta).toEqual({ windowDays: 30 });
  });

  it('signale une liste tronquée quand la fenêtre compte plus d’échecs que la page n’en montre', async () => {
    prisma.notificationLog.count.mockResolvedValue(250);
    prisma.notificationLog.findMany.mockResolvedValue([]);

    const result = await service.getFailedNotifications(7);

    expect(result).toMatchObject({ total: 250, limit: 100, truncated: true, meta: { windowDays: 7 } });
  });
});
