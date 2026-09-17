import { Logger } from '@nestjs/common';
import {
  truncateErrorMessage,
  logNotificationResult,
  logFailedNotification,
  blockIfAppUrlMissing,
} from '../notification-log';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

const asMock = (fn: unknown): jest.Mock => fn as jest.Mock;

describe('truncateErrorMessage', () => {
  it('returns a default message when the error is undefined', () => {
    expect(truncateErrorMessage(undefined)).toBe("Erreur d'envoi inconnue");
  });

  it('returns the message unchanged when under the limit', () => {
    expect(truncateErrorMessage('SMTP connection refused')).toBe('SMTP connection refused');
  });

  it('truncates a message longer than 500 characters', () => {
    const long = 'x'.repeat(600);
    const result = truncateErrorMessage(long);
    expect(result).toHaveLength(500);
    expect(result).toBe('x'.repeat(500));
  });

  it('keeps a message exactly at the limit unchanged', () => {
    const exact = 'y'.repeat(500);
    expect(truncateErrorMessage(exact)).toBe(exact);
  });
});

describe('logNotificationResult', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    asMock(prisma.notificationLog.create).mockResolvedValue({});
  });

  it('writes a "sent" log with a null errorMessage on success', async () => {
    await logNotificationResult(prisma as never, {
      bonId: 'bon-1',
      recipientEmail: 'user@test.fr',
      type: 'mise_dispo_request',
      result: { ok: true },
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: {
        bonId: 'bon-1',
        recipientEmail: 'user@test.fr',
        type: 'mise_dispo_request',
        status: 'sent',
        errorMessage: null,
      },
    });
  });

  it('writes a "failed" log with the truncated error on failure', async () => {
    await logNotificationResult(prisma as never, {
      bonId: 'bon-1',
      recipientEmail: 'user@test.fr',
      type: 'mise_dispo_request',
      result: { ok: false, error: 'boom' },
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'failed', errorMessage: 'boom' }),
    });
  });

  it('includes reminderNumber only when provided', async () => {
    await logNotificationResult(prisma as never, {
      bonId: 'bon-1',
      recipientEmail: 'user@test.fr',
      type: 'reminder',
      result: { ok: true },
      reminderNumber: 2,
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reminderNumber: 2 }),
    });

    asMock(prisma.notificationLog.create).mockClear();
    await logNotificationResult(prisma as never, {
      bonId: 'bon-1',
      recipientEmail: 'user@test.fr',
      type: 'reminder',
      result: { ok: true },
    });
    const data = asMock(prisma.notificationLog.create).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('reminderNumber');
  });
});

describe('logFailedNotification', () => {
  it('writes a failed log with the given error message', async () => {
    const prisma = createMockPrismaService();
    asMock(prisma.notificationLog.create).mockResolvedValue({});

    await logFailedNotification(prisma as never, {
      bonId: 'bon-1',
      recipientEmail: '',
      type: 'contestation_alert',
      errorMessage: 'Aucun utilisateur IT actif',
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: {
        bonId: 'bon-1',
        recipientEmail: '',
        type: 'contestation_alert',
        status: 'failed',
        errorMessage: 'Aucun utilisateur IT actif',
      },
    });
  });
});

describe('blockIfAppUrlMissing', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let logger: Logger;

  beforeEach(() => {
    prisma = createMockPrismaService();
    asMock(prisma.notificationLog.create).mockResolvedValue({});
    logger = { error: jest.fn() } as unknown as Logger;
  });

  it('returns false and logs nothing when appUrl is present', async () => {
    const blocked = await blockIfAppUrlMissing(
      prisma as never,
      logger,
      'https://app.test.local',
      'bon-1',
      'user@test.fr',
      'mise_dispo_request',
    );

    expect(blocked).toBe(false);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns true, logs the error, and persists a failed NotificationLog when appUrl is empty', async () => {
    const blocked = await blockIfAppUrlMissing(
      prisma as never,
      logger,
      '',
      'bon-1',
      'user@test.fr',
      'restitution_due_reminder',
    );

    expect(blocked).toBe(true);
    expect(logger.error).toHaveBeenCalled();
    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: {
        bonId: 'bon-1',
        recipientEmail: 'user@test.fr',
        type: 'restitution_due_reminder',
        status: 'failed',
        errorMessage: "URL de l'application (general.app_url) non configurée",
      },
    });
  });

  it('includes reminderNumber in the persisted log when provided', async () => {
    await blockIfAppUrlMissing(
      prisma as never,
      logger,
      '',
      'bon-1',
      'user@test.fr',
      'reminder',
      { reminderNumber: 2 },
    );

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reminderNumber: 2 }),
    });
  });
});
