/**
 * Enchaînements du service de contestation, dépendances simulées : ce qui est
 * écrit, dans quel ordre, et ce qui n'est PAS fait. Le comportement de bout
 * en bout (base réelle, HTTP) est vérifié par test/contract/contestations.contract.ts.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { ContestationService } from '../contestation.service';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockNotificationService } from '../../common/__tests__/helpers/mock-services';
import type { BonCorrector } from '../bon-correction.port';

type MockPrisma = ReturnType<typeof createMockPrismaService> & Record<string, Record<string, Mock>>;

const BON_ID = 'bon-001';
const USER_ID = 'collab-001';
const TECH_ID = 'tech-001';

function bon(status: string, collaborateurId = USER_ID) {
  return {
    id: BON_ID,
    reference: 'BON-2026-0001',
    status,
    civilite: 'mme',
    collaborateurId,
    collaborateurEmail: 'lea@example.test',
    filiale: { displayName: 'Bâtir Nord' },
    collaborateur: { id: collaborateurId, displayName: 'Léa Martin', email: 'lea@example.test' },
  };
}

describe('ContestationService', () => {
  let prisma: MockPrisma;
  let notifications: ReturnType<typeof createMockNotificationService>;
  let replacement: { createReplacementBon: Mock; reopenForCorrection: Mock };
  let service: ContestationService;

  beforeEach(() => {
    prisma = createMockPrismaService() as MockPrisma;
    prisma.contestation.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 'c-1' });
    prisma.contestation.count = vi.fn().mockResolvedValue(1);
    notifications = createMockNotificationService();
    replacement = {
      createReplacementBon: vi.fn().mockResolvedValue({ id: 'bon-002', reference: 'BON-2026-0002', status: 'draft' }),
      reopenForCorrection: vi.fn().mockResolvedValue(undefined),
    };
    service = new ContestationService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationService,
      replacement as unknown as BonCorrector,
    );
  });

  describe('create', () => {
    function setup(status: string, pending: string[] = []) {
      prisma.bon.findUnique.mockResolvedValue(bon(status));
      prisma.signature.findMany.mockResolvedValue(pending.map((type) => ({ type })));
      prisma.contestation.findFirst.mockResolvedValue(null);
      prisma.contestation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'c-1', ...data, user: { id: USER_ID, displayName: 'Léa Martin', email: 'lea@example.test' } }),
      );
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({});
    }

    it('enregistre le document et le statut d’avant, puis passe le bon en « Contesté » depuis CE statut', async () => {
      setup('sent_restitution', ['restitution']);
      await service.create(BON_ID, USER_ID, '  J’ai tout rendu.  ');
      expect(prisma.contestation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            message: 'J’ai tout rendu.',
            previousBonStatus: 'sent_restitution',
            contestedDocument: 'restitution',
          }),
        }),
      );
      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: BON_ID, status: 'sent_restitution' },
        data: { status: 'contested' },
      });
    });

    it('n’invalide aucun lien de signature (la contestation non retenue ne change rien)', async () => {
      setup('sent_restitution', ['restitution']);
      await service.create(BON_ID, USER_ID, 'Motif');
      expect(prisma.signature.updateMany).not.toHaveBeenCalled();
    });

    it('prévient l’équipe informatique, et une panne d’email ne fait pas échouer la contestation', async () => {
      setup('active');
      notifications.sendContestationAlert.mockRejectedValue(new Error('SMTP en panne'));
      await expect(service.create(BON_ID, USER_ID, 'Motif')).resolves.toBeDefined();
      expect(notifications.sendContestationAlert).toHaveBeenCalledTimes(1);
    });

    it('refuse le compte qui n’est pas titulaire (403)', async () => {
      prisma.bon.findUnique.mockResolvedValue(bon('active', 'quelquun-dautre'));
      prisma.signature.findMany.mockResolvedValue([]);
      await expect(service.create(BON_ID, USER_ID, 'Motif')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bon qui a changé de statut entre la lecture et l’écriture : 409', async () => {
      setup('active');
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.create(BON_ID, USER_ID, 'Motif')).rejects.toBeInstanceOf(ConflictException);
    });

    it('contestation déjà en cours : 409', async () => {
      setup('active');
      prisma.contestation.findFirst.mockResolvedValue({ id: 'c-0' });
      await expect(service.create(BON_ID, USER_ID, 'Motif')).rejects.toBeInstanceOf(ConflictException);
    });

    it('bon introuvable : 404', async () => {
      prisma.bon.findUnique.mockResolvedValue(null);
      await expect(service.create(BON_ID, USER_ID, 'Motif')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolve', () => {
    function setup(previousBonStatus: string | null, contestedDocument: string | null = 'mise_disposition') {
      prisma.contestation.findUnique.mockResolvedValue({
        id: 'c-1',
        bonId: BON_ID,
        previousBonStatus,
        contestedDocument,
        bon: bon('contested'),
        user: { id: USER_ID, displayName: 'Léa Martin', email: 'lea@example.test' },
      });
      prisma.contestation.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUnique.mockResolvedValue({ status: 'contested' });
      prisma.bon.update.mockResolvedValue({});
      prisma.signature.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({});
    }

    it('Non retenue : le bon reprend son statut d’avant, aucun remplaçant, aucun lien touché', async () => {
      setup('sent_restitution');
      const result = await service.resolve('c-1', TECH_ID, 'not_retained', 'Vérifié au stock.');
      expect(prisma.bon.update).toHaveBeenCalledWith({ where: { id: BON_ID }, data: { status: 'sent_restitution' } });
      expect(replacement.createReplacementBon).not.toHaveBeenCalled();
      expect(prisma.signature.updateMany).not.toHaveBeenCalled();
      expect(result.replacementBon).toBeNull();
      expect(notifications.sendContestationResolution).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'rejected',
        'Vérifié au stock.',
        null,
        null,
      );
    });

    it('Non retenue sans réponse (ou espaces seuls) : 400, rien n’est écrit', async () => {
      setup('active');
      await expect(service.resolve('c-1', TECH_ID, 'not_retained', '   ')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contestation.updateMany).not.toHaveBeenCalled();
    });

    it('Fondée : décision « tranchée par », liens du document contesté invalidés (motif « contesté », aucun nouveau lien n’est encore parti), remplaçant créé dans la transaction et nommé dans la réponse', async () => {
      setup('active');
      const result = await service.resolve('c-1', TECH_ID, 'founded');
      expect(prisma.contestation.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-1', status: { in: ['open', 'in_review'] } },
        data: expect.objectContaining({ status: 'resolved', outcome: 'founded', resolvedById: TECH_ID, resolutionMessage: null }),
      });
      expect(prisma.signature.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ invalidatedReason: 'contested' }) }),
      );
      expect(replacement.createReplacementBon).toHaveBeenCalledWith(prisma, BON_ID, 'c-1', TECH_ID);
      expect(result.replacementBon).toEqual({ id: 'bon-002', reference: 'BON-2026-0002', status: 'draft' });
      expect(result.reopenedDocument).toBeNull();
      expect(replacement.reopenForCorrection).not.toHaveBeenCalled();
      expect(notifications.sendContestationResolution).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'resolved',
        undefined,
        expect.objectContaining({ reference: 'BON-2026-0002' }),
        null,
      );
    });

    it.each([
      ['restitution', 'sent_restitution'],
      ['pv_cloture', 'partially_returned'],
    ])('Fondée sur « %s » : le bon d’origine reprend son statut puis est rouvert pour correction, sans remplaçant', async (document, previous) => {
      setup(previous, document);
      const result = await service.resolve('c-1', TECH_ID, 'founded', 'Vous avez raison.');
      expect(prisma.bon.update).toHaveBeenCalledWith({ where: { id: BON_ID }, data: { status: previous } });
      expect(replacement.reopenForCorrection).toHaveBeenCalledWith(BON_ID, document, TECH_ID, prisma);
      // Le statut est rétabli AVANT la réouverture, qui vérifie le document en attente.
      expect(prisma.bon.update.mock.invocationCallOrder[0]).toBeLessThan(
        replacement.reopenForCorrection.mock.invocationCallOrder[0],
      );
      expect(replacement.createReplacementBon).not.toHaveBeenCalled();
      // L'invalidation du lien est celle de la réouverture, ciblée sur le document.
      expect(prisma.signature.updateMany).not.toHaveBeenCalled();
      expect(result.replacementBon).toBeNull();
      expect(result.reopenedDocument).toBe(document);
      // L'email annonce la correction du bon, pas un bon remplaçant.
      expect(notifications.sendContestationResolution).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'resolved',
        'Vous avez raison.',
        null,
        document,
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: expect.objectContaining({ reopenedDocument: document, replacementBonId: null }),
        }),
      });
    });

    it('Fondée sur une restitution qui n’attend plus de signature : l’erreur de la réouverture annule la décision', async () => {
      setup('sent_restitution', 'restitution');
      replacement.reopenForCorrection.mockRejectedValue(new BadRequestException('rien à corriger'));
      await expect(service.resolve('c-1', TECH_ID, 'founded')).rejects.toBeInstanceOf(BadRequestException);
      expect(notifications.sendContestationResolution).not.toHaveBeenCalled();
    });

    it('contestation d’avant la vague 2 (document inconnu) Fondée : bon remplaçant, comme pour une remise', async () => {
      setup(null, null);
      const result = await service.resolve('c-1', TECH_ID, 'founded');
      expect(replacement.createReplacementBon).toHaveBeenCalled();
      expect(replacement.reopenForCorrection).not.toHaveBeenCalled();
      expect(result.reopenedDocument).toBeNull();
    });

    it('contestation antérieure à la vague 2 (sans statut d’avant) : le bon redevient « En cours »', async () => {
      setup(null);
      await service.resolve('c-1', TECH_ID, 'not_retained', 'Réponse.');
      expect(prisma.bon.update).toHaveBeenCalledWith({ where: { id: BON_ID }, data: { status: 'active' } });
    });

    it('déjà tranchée : 409, le bon n’est pas touché', async () => {
      setup('active');
      prisma.contestation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resolve('c-1', TECH_ID, 'founded')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bon.update).not.toHaveBeenCalled();
    });

    it('bon qui n’est plus « Contesté » : 409, pas de remplaçant', async () => {
      setup('active');
      prisma.bon.findUnique.mockResolvedValue({ status: 'archived' });
      await expect(service.resolve('c-1', TECH_ID, 'founded')).rejects.toBeInstanceOf(ConflictException);
      expect(replacement.createReplacementBon).not.toHaveBeenCalled();
    });

    it('une panne d’email de réponse ne remet pas la décision en cause', async () => {
      setup('active');
      notifications.sendContestationResolution.mockRejectedValue(new Error('SMTP en panne'));
      await expect(service.resolve('c-1', TECH_ID, 'not_retained', 'Réponse.')).resolves.toBeDefined();
    });

    it('contestation introuvable : 404', async () => {
      prisma.contestation.findUnique.mockResolvedValue(null);
      await expect(service.resolve('c-x', TECH_ID, 'founded')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markInReview', () => {
    it('renseigne « pris en charge par » et sa date, jamais « tranché par »', async () => {
      prisma.contestation.updateMany.mockResolvedValue({ count: 1 });
      await service.markInReview('c-1', TECH_ID);
      const call = prisma.contestation.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'c-1', status: 'open' });
      expect(call.data).toEqual(expect.objectContaining({ status: 'in_review', reviewedById: TECH_ID }));
      expect(call.data.reviewedAt).toBeInstanceOf(Date);
      expect(call.data).not.toHaveProperty('resolvedById');
    });

    it('introuvable : 404 ; déjà prise en charge : 409', async () => {
      prisma.contestation.updateMany.mockResolvedValue({ count: 0 });
      prisma.contestation.count.mockResolvedValueOnce(0);
      await expect(service.markInReview('c-x', TECH_ID)).rejects.toBeInstanceOf(NotFoundException);
      prisma.contestation.count.mockResolvedValueOnce(1);
      await expect(service.markInReview('c-1', TECH_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
