import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS = 30;
const NOTIFICATION_FAILURES_ROW_LIMIT = 100;

/**
 * GET /admin/notifications/failed — migré depuis reporting.service.ts
 * (`getFailedNotifications`, condamné avec le reste du module Reporting) :
 * même forme de réponse, désormais avec une fenêtre en jours paramétrable.
 * Un lien de signature en échec ne doit pas rester silencieux.
 */
@Injectable()
export class NotificationFailuresService {
  constructor(private readonly prisma: PrismaService) {}

  async getFailedNotifications(windowDays: number = DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS) {
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

    return {
      count,
      windowDays,
      items: rows.map((r) => ({
        id: r.id,
        bonId: r.bon?.id ?? null,
        reference: r.bon?.reference ?? '—',
        recipient: r.recipientEmail,
        type: r.type,
        sentAt: r.sentAt,
        error: r.errorMessage ?? '',
      })),
    };
  }
}
