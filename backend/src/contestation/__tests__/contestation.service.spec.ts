import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ContestationService } from '../contestation.service';
import { NotificationService } from '../../notification/notification.service';
import { SignatureService } from '../../signature/signature.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import {
  createMockNotificationService,
  createMockSignatureService,
} from '../../common/__tests__/helpers/mock-services';
import { activeBon, draftBon } from '../../common/__tests__/fixtures/bon.fixtures';
import { collaboratorUser, adminUser } from '../../common/__tests__/fixtures/user.fixtures';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

describe('ContestationService', () => {
  let service: ContestationService;
  let prisma: MockPrisma;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let signatureService: ReturnType<typeof createMockSignatureService>;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    notificationService = createMockNotificationService();
    signatureService = createMockSignatureService();

    service = new ContestationService(
      prisma as unknown as PrismaService,
      notificationService as unknown as NotificationService,
      signatureService as unknown as SignatureService,
    );
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const collab = collaboratorUser();
    const message = 'Je conteste cet equipement, il ne correspond pas.';

    function setupActiveBon() {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.contestation.findFirst.mockResolvedValue(null);
      prisma.contestation.create.mockResolvedValue({
        id: 'contestation-001',
        bonId: bon.id,
        userId: collab.id,
        message,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedById: null,
        resolutionMessage: null,
        bon: { id: bon.id, reference: bon.reference },
        user: { id: collab.id, displayName: collab.displayName, email: collab.email },
      });
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'contested' });
      prisma.auditLog.create.mockResolvedValue({});
      return bon;
    }

    it('should create a contestation for active bon', async () => {
      const bon = setupActiveBon();

      const result = await service.create(bon.id, collab.id, message);

      expect(result).toBeDefined();
      expect(result.status).toBe('open');
      expect(result.bonId).toBe(bon.id);
      expect(prisma.contestation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bonId: bon.id,
            userId: collab.id,
            message,
            status: 'open',
          }),
        }),
      );
    });

    it('should set bon status to contested', async () => {
      const bon = setupActiveBon();

      await service.create(bon.id, collab.id, message);

      expect(prisma.bon.update).toHaveBeenCalledWith({
        where: { id: bon.id },
        data: { status: 'contested' },
      });
    });

    it('should invalidate unsigned tokens', async () => {
      const bon = setupActiveBon();

      await service.create(bon.id, collab.id, message);

      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
    });

    it('should send contestation alert email', async () => {
      const bon = setupActiveBon();

      await service.create(bon.id, collab.id, message);

      expect(notificationService.sendContestationAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: bon.id }),
        expect.objectContaining({ id: collab.id }),
        message,
      );
    });

    it('should throw for non-active bon', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.create(bon.id, collab.id, message),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if not the collaborateur', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.create(bon.id, 'different-user-id', message),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if contestation already open', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.contestation.findFirst.mockResolvedValue({
        id: 'existing-contestation',
        bonId: bon.id,
        status: 'open',
      });

      await expect(
        service.create(bon.id, collab.id, message),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── resolve ───────────────────────────────────────────────────────────────

  describe('resolve', () => {
    const admin = adminUser();

    function setupOpenContestation() {
      const bon = activeBon();
      const contestation = {
        id: 'contestation-resolve-001',
        bonId: bon.id,
        userId: collaboratorUser().id,
        message: 'Equipement manquant',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedById: null,
        resolutionMessage: null,
        bon: { ...bon, filiale: bon.filiale, collaborateur: bon.collaborateur },
        user: { id: collaboratorUser().id, displayName: 'Jean Dupont', email: 'jean.dupont@groupelivio.fr' },
      };

      prisma.contestation.findUnique.mockResolvedValue(contestation);
      prisma.contestation.update.mockResolvedValue({
        ...contestation,
        status: 'resolved',
        resolvedById: admin.id,
        resolutionMessage: 'Equipement remplace',
        bon: { id: bon.id, reference: bon.reference, status: bon.status },
        user: contestation.user,
        resolvedBy: { id: admin.id, displayName: admin.displayName },
      });
      prisma.auditLog.findFirst.mockResolvedValue({
        details: { previousStatus: 'active' },
      });
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      return { contestation, bon };
    }

    it('should resolve contestation and restore previous status', async () => {
      const { contestation } = setupOpenContestation();

      const result = await service.resolve(
        contestation.id,
        admin.id,
        'resolved',
        'Equipement remplace',
      );

      expect(result.status).toBe('resolved');
      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'active' },
        }),
      );
    });

    it('should send resolution email to collaborateur', async () => {
      const { contestation } = setupOpenContestation();

      await service.resolve(contestation.id, admin.id, 'resolved', 'Equipement remplace');

      expect(notificationService.sendContestationResolution).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ email: 'jean.dupont@groupelivio.fr' }),
        'resolved',
        'Equipement remplace',
      );
    });

    it('should throw for already-closed contestation', async () => {
      prisma.contestation.findUnique.mockResolvedValue({
        id: 'contestation-closed-001',
        bonId: 'bon-1',
        status: 'resolved',
        bon: { filiale: {}, collaborateur: {} },
        user: { id: 'u1', displayName: 'X', email: 'x@y.z' },
      });

      await expect(
        service.resolve('contestation-closed-001', admin.id, 'resolved'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── markInReview ──────────────────────────────────────────────────────────

  describe('markInReview', () => {
    const admin = adminUser();

    it('should transition from open to in_review', async () => {
      const contestation = {
        id: 'contestation-review-001',
        bonId: 'bon-1',
        status: 'open',
      };
      prisma.contestation.findUnique.mockResolvedValue(contestation);
      prisma.contestation.update.mockResolvedValue({
        ...contestation,
        status: 'in_review',
        resolvedById: admin.id,
        bon: { id: 'bon-1', reference: 'BMD-2026-0001' },
        user: { id: 'u1', displayName: 'Jean', email: 'jean@x.fr' },
        resolvedBy: { id: admin.id, displayName: admin.displayName },
      });

      const result = await service.markInReview(contestation.id, admin.id);

      expect(result.status).toBe('in_review');
      expect(prisma.contestation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_review', resolvedById: admin.id }),
        }),
      );
    });

    it('should throw for non-open contestation', async () => {
      prisma.contestation.findUnique.mockResolvedValue({
        id: 'contestation-closed-002',
        bonId: 'bon-2',
        status: 'in_review',
      });

      await expect(
        service.markInReview('contestation-closed-002', admin.id),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
