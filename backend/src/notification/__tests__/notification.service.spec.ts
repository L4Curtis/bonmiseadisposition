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

      expect(result).toEqual({ ok: true });
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@test.local',
        to: 'user@test.fr',
        subject: 'Subject',
        html: '<p>Hello</p>',
      });
    });

    it('should return ok:false with an error and log when SMTP not configured', async () => {
      // Override get to return null for host
      configService.get.mockImplementation((category: string, key: string) => {
        if (category === 'smtp' && key === 'host') return Promise.resolve(null);
        return Promise.resolve(
          category === 'smtp' && key === 'from' ? 'noreply@test.local' : null,
        );
      });

      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return ok:false with an explicit error when smtp.from is not configured', async () => {
      configService.get.mockImplementation((category: string, key: string) => {
        if (category === 'smtp' && key === 'host') return Promise.resolve('smtp.test.local');
        if (category === 'smtp' && key === 'from') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result).toEqual({ ok: false, error: 'Expéditeur SMTP (smtp.from) non configuré' });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return ok:false with the real SMTP error message', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const result = await service.sendEmail('user@test.fr', 'Subject', '<p>Hello</p>');

      expect(result).toEqual({ ok: false, error: 'SMTP connection refused' });
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

  // ─── sendRestitutionDueReminder ─────────────────────────────────────────────

  describe('sendRestitutionDueReminder', () => {
    const dueBon = () => ({
      ...activeBon(),
      dateRestitution: new Date('2026-04-12'),
    }) as unknown as NotificationBon;

    it('renders the template with the expected variables and sends to the current collaborateur email', async () => {
      const bon = {
        ...dueBon(),
        collaborateur: { displayName: 'Jean Dupont', email: 'jean.updated@groupelivio.fr' },
      } as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      const ok = await service.sendRestitutionDueReminder(bon);

      expect(ok).toBe(true);
      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'restitution_due_reminder',
        expect.objectContaining({
          REFERENCE: bon.reference,
          DATE_RESTITUTION: expect.any(String),
          EQUIP_LIST: expect.any(String),
          PORTAIL_URL: 'https://app.test.local/mes-bons',
        }),
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jean.updated@groupelivio.fr' }),
      );
    });

    it('falls back to collaborateurEmail when the current collaborateur has no email', async () => {
      const bon = {
        ...dueBon(),
        collaborateur: { displayName: 'Jean Dupont' },
      } as unknown as NotificationBon;
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendRestitutionDueReminder(bon);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: bon.collaborateurEmail }),
      );
    });

    it('excludes already-returned or not-returned equipment from the loaned list', async () => {
      const bon = dueBon();
      bon.equipments = [
        { ...bon.equipments![0], returnedAt: new Date('2026-03-01') }, // déjà rendu
        { ...bon.equipments![1], notReturned: true }, // signalé non restitué
        bon.equipments![2], // encore prêté
      ];
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendRestitutionDueReminder(bon);

      const call = templatesService.renderTemplate.mock.calls.find((c) => c[0] === 'restitution_due_reminder');
      const equipList = call?.[1]?.EQUIP_LIST ?? '';
      expect(equipList).toContain('Logitech MX Master 3S');
      expect(equipList).not.toContain('Lenovo ThinkBook 16 G6');
      expect(equipList).not.toContain('Dell UltraSharp U2723QE');
    });

    it('creates a sent NotificationLog on success', async () => {
      const bon = dueBon();
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendRestitutionDueReminder(bon);

      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bonId: bon.id,
          type: 'restitution_due_reminder',
          status: 'sent',
        }),
      });
    });

    it('creates a failed NotificationLog when the send fails', async () => {
      const bon = dueBon();
      mockSendMail.mockRejectedValueOnce(new Error('smtp down'));
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      const ok = await service.sendRestitutionDueReminder(bon);

      expect(ok).toBe(false);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ bonId: bon.id, type: 'restitution_due_reminder', status: 'failed' }),
      });
    });

    it('falls back to FRONTEND_URL when general.app_url is missing (production) — same rule as the admin page pre-fill', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://env.test.local/';
      try {
        configService.get.mockImplementation((category: string, key: string) => {
          if (category === 'general' && key === 'app_url') return Promise.resolve(null);
          if (category === 'smtp' && key === 'host') return Promise.resolve('smtp.test.local');
          if (category === 'smtp' && key === 'from') return Promise.resolve('noreply@test.local');
          return Promise.resolve(null);
        });
        const bon = dueBon();
        asMock(prisma.notificationLog.create).mockResolvedValue({});

        const ok = await service.sendRestitutionDueReminder(bon);

        expect(ok).toBe(true);
        expect(mockSendMail).toHaveBeenCalledTimes(1);
        // Le template est mocké : on vérifie l'URL transmise au rendu (slash final retiré).
        expect(templatesService.renderTemplate).toHaveBeenCalledWith(
          'restitution_due_reminder',
          expect.objectContaining({ PORTAIL_URL: 'https://env.test.local/mes-bons' }),
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl !== undefined) process.env.FRONTEND_URL = originalFrontendUrl; else delete process.env.FRONTEND_URL;
      }
    });

    it('blocks sending and logs a failed NotificationLog when app_url is not configured (production)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL; // sans repli d'environnement, la garde doit bloquer
      try {
        configService.get.mockImplementation((category: string, key: string) => {
          if (category === 'general' && key === 'app_url') return Promise.resolve(null);
          if (category === 'smtp' && key === 'host') return Promise.resolve('smtp.test.local');
          if (category === 'smtp' && key === 'from') return Promise.resolve('noreply@test.local');
          return Promise.resolve(null);
        });
        const bon = dueBon();
        asMock(prisma.notificationLog.create).mockResolvedValue({});

        const ok = await service.sendRestitutionDueReminder(bon);

        expect(ok).toBe(false);
        expect(mockSendMail).not.toHaveBeenCalled();
        expect(prisma.notificationLog.create).toHaveBeenCalledWith({
          data: {
            bonId: bon.id,
            recipientEmail: bon.collaborateurEmail,
            type: 'restitution_due_reminder',
            status: 'failed',
            errorMessage: "URL de l'application (general.app_url) non configurée",
          },
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl !== undefined) process.env.FRONTEND_URL = originalFrontendUrl;
      }
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

    it('should log a failed notification when no IT staff found (instead of silently skipping)', async () => {
      const bon = activeBon() as unknown as NotificationBon;
      asMock(prisma.user.findMany).mockResolvedValue([]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendContestationAlert(bon, { displayName: 'Test' }, 'msg');

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: {
          bonId: bon.id,
          recipientEmail: '',
          type: 'contestation_alert',
          status: 'failed',
          errorMessage: 'Aucun utilisateur IT actif',
        },
      });
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
        signatures: [{
          id: 'sig-pending-001',
          type: 'mise_disposition',
          signed: false,
          token: 'pending-token',
          tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // encore valide
        }],
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

    it('should skip entirely when SMTP is not configured (no token regenerated, no failed log created)', async () => {
      configService.set('rappels', 'enabled', 'true');
      configService.get.mockImplementation((category: string, key: string) => {
        if (category === 'smtp' && key === 'host') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await service.sendDailyReminders();

      expect(prisma.bon.findMany).not.toHaveBeenCalled();
      expect(prisma.signature.create).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('should regenerate an expired token instead of sending a dead link', async () => {
      configService.set('rappels', 'enabled', 'true');
      configService.set('rappels', 'delay_1', '3');

      const bon = sentMiseDispoBon();
      const pendingBon = {
        ...bon,
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        signatures: [{
          id: 'sig-expired-001',
          type: 'mise_disposition',
          signed: false,
          token: 'expired-token',
          tokenExpiresAt: new Date(Date.now() - 60_000), // expiré
        }],
        notifications: [],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);
      asMock(prisma.signature.updateMany).mockResolvedValue({ count: 1 });
      asMock(prisma.signature.create).mockResolvedValue({ token: 'fresh-token' });
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendDailyReminders();

      // Un nouveau token est créé et c'est LUI qui part dans l'email
      expect(prisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon.id, type: 'mise_disposition' }),
        }),
      );
      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'reminder',
        expect.objectContaining({ SIGNER_URL: expect.stringContaining('fresh-token') }),
      );
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should skip the reminder (without invalidating the token) for a still-valid in-person signature', async () => {
      configService.set('rappels', 'enabled', 'true');
      configService.set('rappels', 'delay_1', '3');

      const bon = sentMiseDispoBon();
      const pendingBon = {
        ...bon,
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        signatures: [{
          id: 'sig-in-person-001',
          type: 'mise_disposition',
          signed: false,
          isInPerson: true,
          token: 'in-person-token',
          tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // encore valide
        }],
        notifications: [],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);

      await service.sendDailyReminders();

      expect(prisma.signature.updateMany).not.toHaveBeenCalled();
      expect(prisma.signature.create).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('should remind pending PV co-signature on partially_returned bons', async () => {
      configService.set('rappels', 'enabled', 'true');
      configService.set('rappels', 'delay_1', '3');

      const bon = sentMiseDispoBon();
      const pendingBon = {
        ...bon,
        status: 'partially_returned',
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        signatures: [{
          id: 'sig-pv-001',
          type: 'pv_cloture',
          signed: false,
          token: 'pv-token',
          tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }],
        notifications: [],
      };

      asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.sendDailyReminders();

      expect(templatesService.renderTemplate).toHaveBeenCalledWith(
        'reminder',
        expect.objectContaining({
          TYPE_LABEL: "procès-verbal d'équipements non restitués",
          SIGNER_URL: expect.stringContaining('pv-token'),
        }),
      );
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('blocks the reminder and logs a failed NotificationLog when app_url is not configured (production) instead of sending a dead relative link', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL; // sans repli d'environnement, la garde doit bloquer
      try {
        configService.set('rappels', 'enabled', 'true');
        configService.set('rappels', 'delay_1', '3');

        const bon = sentMiseDispoBon();
        const pendingBon = {
          ...bon,
          updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          signatures: [{
            id: 'sig-pending-002',
            type: 'mise_disposition',
            signed: false,
            token: 'pending-token-2',
            tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }],
          notifications: [],
        };

        asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);
        asMock(prisma.notificationLog.create).mockResolvedValue({});
        configService.get.mockImplementation((category: string, key: string) => {
          if (category === 'general' && key === 'app_url') return Promise.resolve(null);
          if (category === 'rappels' && key === 'enabled') return Promise.resolve('true');
          if (category === 'rappels' && key === 'delay_1') return Promise.resolve('3');
          if (category === 'smtp' && key === 'host') return Promise.resolve('smtp.test.local');
          if (category === 'smtp' && key === 'from') return Promise.resolve('noreply@test.local');
          return Promise.resolve(null);
        });

        await service.sendDailyReminders();

        expect(mockSendMail).not.toHaveBeenCalled();
        expect(prisma.notificationLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            bonId: pendingBon.id,
            type: 'reminder',
            status: 'failed',
            errorMessage: "URL de l'application (general.app_url) non configurée",
          }),
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl !== undefined) process.env.FRONTEND_URL = originalFrontendUrl;
      }
    });

    it('does not regenerate an expired token when app_url is not configured (production) — no wasted token', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL; // sans repli d'environnement, la garde doit bloquer
      try {
        configService.set('rappels', 'enabled', 'true');
        configService.set('rappels', 'delay_1', '3');

        const bon = sentMiseDispoBon();
        const pendingBon = {
          ...bon,
          updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          signatures: [{
            id: 'sig-expired-002',
            type: 'mise_disposition',
            signed: false,
            token: 'expired-token-2',
            tokenExpiresAt: new Date(Date.now() - 60_000), // expiré : déclencherait normalement une régénération
          }],
          notifications: [],
        };

        asMock(prisma.bon.findMany).mockResolvedValue([pendingBon]);
        asMock(prisma.notificationLog.create).mockResolvedValue({});
        configService.get.mockImplementation((category: string, key: string) => {
          if (category === 'general' && key === 'app_url') return Promise.resolve(null);
          if (category === 'rappels' && key === 'enabled') return Promise.resolve('true');
          if (category === 'rappels' && key === 'delay_1') return Promise.resolve('3');
          if (category === 'smtp' && key === 'host') return Promise.resolve('smtp.test.local');
          if (category === 'smtp' && key === 'from') return Promise.resolve('noreply@test.local');
          return Promise.resolve(null);
        });

        await service.sendDailyReminders();

        // La garde app_url doit s'exécuter AVANT toute régénération de token
        expect(prisma.signature.updateMany).not.toHaveBeenCalled();
        expect(prisma.signature.create).not.toHaveBeenCalled();
        expect(mockSendMail).not.toHaveBeenCalled();
        expect(prisma.notificationLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            bonId: pendingBon.id,
            type: 'reminder',
            status: 'failed',
            errorMessage: "URL de l'application (general.app_url) non configurée",
          }),
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl !== undefined) process.env.FRONTEND_URL = originalFrontendUrl;
      }
    });
  });

  // ─── runRestitutionDueReminders ────────────────────────────────────────────

  describe('runRestitutionDueReminders', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-10T08:00:00Z')); // 10h Paris (CEST, UTC+2)
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does nothing when restitution_before_days is 0 (feature disabled)', async () => {
      configService.set('rappels', 'restitution_before_days', '0');

      await service.runRestitutionDueReminders();

      expect(prisma.bon.findMany).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does nothing when SMTP is not configured', async () => {
      configService.set('rappels', 'restitution_before_days', '7');
      configService.get.mockImplementation((category: string, key: string) => {
        if (category === 'smtp' && key === 'host') return Promise.resolve(null);
        if (category === 'rappels' && key === 'restitution_before_days') return Promise.resolve('7');
        return Promise.resolve(null);
      });

      await service.runRestitutionDueReminders();

      expect(prisma.bon.findMany).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('queries eligible bons with the status/date-window/idempotence/equipment filters (default 7 days)', async () => {
      asMock(prisma.bon.findMany).mockResolvedValue([]);

      await service.runRestitutionDueReminders();

      expect(prisma.bon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            // active ET partially_returned : équipements encore prêtés dont la
            // restitution approche, même si le bon a déjà entamé une restitution partielle
            status: { in: ['active', 'partially_returned'] },
            dateRestitution: {
              gte: new Date('2026-04-10T00:00:00.000Z'),
              lte: new Date('2026-04-17T23:59:59.999Z'),
            },
            notifications: { none: { type: 'restitution_due_reminder', status: 'sent' } },
            equipments: { some: { returnedAt: null, notReturned: false } },
          },
        }),
      );
    });

    it('does not exclude a bon whose only prior notification is failed (retries after a transient SMTP failure)', async () => {
      // L'idempotence porte sur un log 'sent' uniquement : un échec transitoire
      // (SMTP down, app_url absente le jour J) ne doit pas bloquer tout
      // réessai les jours suivants — cf. runDailyReminders qui suit la même règle.
      asMock(prisma.bon.findMany).mockResolvedValue([]);

      await service.runRestitutionDueReminders();

      expect(prisma.bon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            notifications: { none: { type: 'restitution_due_reminder', status: 'sent' } },
          }),
        }),
      );
    });

    it('uses the configured restitution_before_days value for the window', async () => {
      configService.set('rappels', 'restitution_before_days', '3');
      asMock(prisma.bon.findMany).mockResolvedValue([]);

      await service.runRestitutionDueReminders();

      expect(prisma.bon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateRestitution: {
              gte: new Date('2026-04-10T00:00:00.000Z'),
              lte: new Date('2026-04-13T23:59:59.999Z'),
            },
          }),
        }),
      );
    });

    it('sends a reminder for each eligible bon and creates a sent NotificationLog', async () => {
      const bon1 = { ...activeBon(), dateRestitution: new Date('2026-04-12') };
      const bon2 = {
        ...activeBon(),
        id: 'bon-active-002',
        reference: 'BON-2026-0021',
        dateRestitution: new Date('2026-04-14'),
      };
      asMock(prisma.bon.findMany).mockResolvedValue([bon1, bon2]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});

      await service.runRestitutionDueReminders();

      expect(mockSendMail).toHaveBeenCalledTimes(2);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon1.id, type: 'restitution_due_reminder', status: 'sent' }),
        }),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon2.id, type: 'restitution_due_reminder', status: 'sent' }),
        }),
      );
    });

    it('continues processing remaining bons when one bon fails unexpectedly (no fire-and-forget)', async () => {
      const bon1 = { ...activeBon(), dateRestitution: new Date('2026-04-12') };
      const bon2 = {
        ...activeBon(),
        id: 'bon-active-002',
        reference: 'BON-2026-0021',
        dateRestitution: new Date('2026-04-14'),
      };
      asMock(prisma.bon.findMany).mockResolvedValue([bon1, bon2]);
      asMock(prisma.notificationLog.create).mockResolvedValue({});
      templatesService.renderTemplate.mockRejectedValueOnce(new Error('boom'));

      await service.runRestitutionDueReminders();

      // bon1's render threw — caught per-bon, bon2 is still processed
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon2.id, status: 'sent' }),
        }),
      );
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
