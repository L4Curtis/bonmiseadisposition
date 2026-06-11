import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { NotificationService } from '../notification.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from '../../templates/templates.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService, createMockTemplatesService } from '../../common/__tests__/helpers/mock-services';
import { activeBon, sentMiseDispoBon, partiallyReturnedBon } from '../../common/__tests__/fixtures/bon.fixtures';
import { NotificationBon } from '../../common/types';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

// Helper to access jest.Mock methods on deeply-nested prisma mocks
const asMock = (fn: unknown): jest.Mock => fn as jest.Mock;

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let templatesService: ReturnType<typeof createMockTemplatesService>;

  const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-001' });

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = createMockPrismaService();
    configService = createMockConfigService();
    templatesService = createMockTemplatesService();

    // Default SMTP config
    configService.set('smtp', 'host', 'smtp.test.local');
    configService.set('smtp', 'port', '587');
    configService.set('smtp', 'user', 'user@test.local');
    configService.set('smtp', 'password', 'pass');
    configService.set('smtp', 'secure', 'false');
    configService.set('smtp', 'from', 'noreply@test.local');
    configService.set('general', 'app_url', 'https://app.test.local');

    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: configService },
        { provide: TemplatesService, useValue: templatesService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  // ─── sendEmail ──────────────────────────────────────────────────────────────

  describe('sendEmail', () => {
    it('should send email via SMTP transporter', async () => {
      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result).toBe(true);
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@test.local',
        to: 'user@test.fr',
        subject: 'Subject',
        html: '<p>Hello</p>',
      });
    });

    it('should return false and log when SMTP not configured', async () => {
      // Override get to return null for host
      configService.get.mockImplementation((category: string, key: string) => {
        if (category === 'smtp' && key === 'host') return Promise.resolve(null);
        return Promise.resolve(
          category === 'smtp' && key === 'from' ? 'noreply@test.local' : null,
        );
      });

      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return false and log on SMTP error', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result).toBe(false);
    });
  });

  // ─── sendMiseDispositionRequest ─────────────────────────────────────────────

  describe('sendMiseDispositionRequest', () => {
    it('should send mise a disposition email', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendMiseDispositionRequest(bon, 'token-abc');

      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'mise_disposition_request',
        expect.objectContaining({
          REFERENCE: bon.reference,
          SIGNER_URL: 'https://app.test.local/signer/token-abc',
        }),
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: bon.collaborateurEmail,
        }),
      );
    });

    it('should create notification log', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendMiseDispositionRequest(bon, 'token-abc');

      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bonId: bon.id,
          recipientEmail: bon.collaborateurEmail,
          type: 'mise_dispo_request',
          status: 'sent',
        }),
      });
    });

    it('should create failed log when send fails', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      mockSendMail.mockRejectedValueOnce(new Error('fail'));
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendMiseDispositionRequest(bon, 'token-abc');

      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bonId: bon.id,
          status: 'failed',
        }),
      });
    });
  });

  // ─── sendRestitutionRequest ─────────────────────────────────────────────────

  describe('sendRestitutionRequest', () => {
    it('should send restitution email', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendRestitutionRequest(bon, 'token-restit');

      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'restitution_request',
        expect.objectContaining({
          REFERENCE: bon.reference,
          SIGNER_URL: 'https://app.test.local/signer/token-restit',
        }),
      );
      expect(mockSendMail).toHaveBeenCalled();
    });
  });

  // ─── sendPvClotureRequest ──────────────────────────────────────────────────

  describe('sendPvClotureRequest', () => {
    it('should send PV cloture email with not-returned list', async () => {
      const bon = partiallyReturnedBon() as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendPvClotureRequest(bon, 'token-pv');

      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'pv_cloture_request',
        expect.objectContaining({
          REFERENCE: bon.reference,
          SIGNER_URL: 'https://app.test.local/signer/token-pv',
          NOT_RETURNED_LIST: expect.any(String),
        }),
      );
      expect(mockSendMail).toHaveBeenCalled();
    });
  });

  // ─── sendContestationAlert ─────────────────────────────────────────────────

  describe('sendContestationAlert', () => {
    it('should send email to all IT staff', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      const contestingUser = { displayName: 'Jean Dupont', email: 'jean@test.fr' };
      asMock(prisma.user.findMany).mockResolvedValue([
        { email: 'it1@test.fr' },
        { email: 'it2@test.fr' },
      ]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendContestationAlert(bon, contestingUser, 'Equipement manquant');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { isItStaff: true, active: true },
        select: { email: true },
      });
      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'contestation_alert',
        expect.objectContaining({
          USER_NAME: 'Jean Dupont',
          CONTESTATION_MESSAGE: 'Equipement manquant',
        }),
      );
      // Should send to both IT staff
      expect(mockSendMail).toHaveBeenCalledTimes(2);
    });

    it('should skip if no IT staff found', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.user.findMany).mockResolvedValue([]);

      await service.sendContestationAlert(bon, { displayName: 'Test' }, 'msg');

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── sendCancellationNotice ────────────────────────────────────────────────

  describe('sendCancellationNotice', () => {
    it('should send cancellation notice', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendCancellationNotice(bon);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: bon.collaborateurEmail,
          subject: expect.stringContaining('annulé'),
        }),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bonId: bon.id,
          type: 'cancellation',
          status: 'sent',
        }),
      });
    });
  });

  // ─── sendDailyReminders ────────────────────────────────────────────────────

  describe('sendDailyReminders', () => {
    it('should send reminders for pending bons', async () => {
      // Same category/keys as the admin UI (rappels.enabled / delay_1..3)
      configService.set('rappels', 'enabled', 'true');
      configService.set('rappels', 'delay_1', '3');

      const bon = sentMiseDispoBon();
      const pendingBon = {
        ...bon,
        updatedAt: new Date('2026-01-01T00:00:00Z'), // old enough
        notifications: [],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendDailyReminders();

      expect(prisma.bon.findMany).toHaveBeenCalled();
      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'reminder',
        expect.objectContaining({
          REMINDER_NUMBER: '1',
          MAX_REMINDERS: '3',
        }),
      );
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should not exceed max reminders (3 tiers)', async () => {
      configService.set('rappels', 'enabled', 'true');

      const bon = sentMiseDispoBon();
      const pendingBon = {
        ...bon,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        notifications: [
          { type: 'reminder', sentAt: new Date(), status: 'sent' },
          { type: 'reminder', sentAt: new Date(), status: 'sent' },
          { type: 'reminder', sentAt: new Date(), status: 'sent' },
        ],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);

      await service.sendDailyReminders();

      // Should not send email since all 3 reminder tiers were already sent
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should stagger reminders according to delay tiers', async () => {
      configService.set('rappels', 'enabled', 'true');
      configService.set('rappels', 'delay_1', '3');
      configService.set('rappels', 'delay_2', '7');

      const bon = sentMiseDispoBon();
      // One reminder already sent, bon pending for only 5 days → tier 2 (7 d) not due yet
      const pendingBon = {
        ...bon,
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        notifications: [{ type: 'reminder', sentAt: new Date(), status: 'sent' }],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);

      await service.sendDailyReminders();

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should skip when reminders disabled', async () => {
      configService.set('rappels', 'enabled', 'false');

      await service.sendDailyReminders();

      expect(prisma.bon.findMany).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ─── Transporter cache ─────────────────────────────────────────────────────

  describe('transporter cache', () => {
    it('should rebuild the transporter when the SMTP config changes', async () => {
      // Prime the cache by sending an email
      await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);

      // Send again — should reuse cached transporter
      await service.sendEmail('user@test.fr', 'Subject2', '<p>Hello2</p>');
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);

      // Change the SMTP config (the cache key is derived from config values)
      configService.set('smtp', 'host', 'smtp.other-server.local');

      // Send again — should create new transporter
      await service.sendEmail('user@test.fr', 'Subject3', '<p>Hello3</p>');
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(2);
    });
  });
});
