import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toListResponse } from '../common/pagination';
import type { FailedNotificationsResponse } from '../contracts/admin';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS = 30;
const NOTIFICATION_FAILURES_ROW_LIMIT = 100;

/**
 * GET /admin/notifications/failed — emails en échec des `windowDays` derniers
 * jours, les plus récents d'abord (100 au plus : `truncated` le signale). Un
 * lien de signature qui n'est pas parti ne doit pas rester silencieux.
 */
@Injectable()
export class NotificationFailuresService {
  constructor(private readonly prisma: PrismaService) {}

  async getFailedNotifications(
    windowDays: number = DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS,
  ): Promise<FailedNotificationsResponse> {
    const since = new Date(Date.now() - windowDays * DAY_MS);
    const [count, rows] = await Promise.all([
      this.prisma.notificationLog.count({ where: { status: 'failed', sentAt: { gte: since } } }),
      this.prisma.notificationLog.findMany({
        where: { status: 'failed', sentAt: { gte: since } },
        select: {
          id: true,
          recipientEmail: true,
          type: true,
          sentAt: true,
          errorMessage: true,
          bon: { select: { id: true, reference: true } },
        },
        orderBy: { sentAt: 'desc' },
        take: NOTIFICATION_FAILURES_ROW_LIMIT,
      }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      bonId: r.bon.id,
      reference: r.bon.reference,
      recipient: r.recipientEmail,
      type: r.type,
      sentAt: r.sentAt.toISOString(),
      error: r.errorMessage ?? '',
    }));
    return toListResponse(items, {
      total: count,
      page: 1,
      limit: NOTIFICATION_FAILURES_ROW_LIMIT,
      truncated: count > items.length,
      meta: { windowDays },
    });
  }
}
