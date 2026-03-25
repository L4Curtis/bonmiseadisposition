import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { BonsService } from '../bons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import {
  createMockNotificationService,
  createMockSignatureService,
  createMockPdfService,
  createMockSmbService,
} from '../../common/__tests__/helpers/mock-services';
import {
  draftBon,
  activeBon,
  sentMiseDispoBon,
  archivedBon,
  partiallyReturnedBon,
  cancelledBon,
  contestedBon,
} from '../../common/__tests__/fixtures/bon.fixtures';
import { collaboratorUser, technicianUser } from '../../common/__tests__/fixtures/user.fixtures';

describe('BonsService', () => {
  let service: BonsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let signatureService: ReturnType<typeof createMockSignatureService>;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let pdfService: ReturnType<typeof createMockPdfService>;
  let smbService: ReturnType<typeof createMockSmbService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    signatureService = createMockSignatureService();
    notificationService = createMockNotificationService();
    pdfService = createMockPdfService();
    smbService = createMockSmbService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SignatureService, useValue: signatureService },
        { provide: NotificationService, useValue: notificationService },
        { provide: PdfService, useValue: pdfService },
        { provide: SmbService, useValue: smbService },
      ],
    }).compile();

    service = module.get<BonsService>(BonsService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const userId = 'user-tech-001';
    const dto = {
      filialeId: 'filiale-001',
      collaborateurId: 'user-collab-001',
      civilite: 'mr' as const,
      dateMiseDisposition: '2026-04-01',
      notes: 'Test bon',
      equipments: [
        { catalogItemId: 'cat-laptop-001', serialNumber: 'SN-001', order: 0 },
      ],
    };

    beforeEach(() => {
      // generateReference uses $transaction + $executeRaw + bon.findFirst
      prisma.$executeRaw.mockResolvedValue(undefined);
      prisma.bon.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(collaboratorUser());
      prisma.bon.create.mockResolvedValue(draftBon());
      prisma.auditLog.create.mockResolvedValue({} as never);
    });

    it('should create a bon with generated reference', async () => {
      const result = await service.create(dto, userId);

      expect(result).toEqual(draftBon());
      expect(prisma.bon.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'bon_created', userId }),
        }),
      );
    });

    it('should create a bon with equipment from a pack', async () => {
      const packDto = { ...dto, packId: 'pack-001', equipments: undefined };
      prisma.equipmentPack.findUnique.mockResolvedValue({
        id: 'pack-001',
        name: 'Pack Standard',
        items: [
          {
            id: 'pack-item-001',
            packId: 'pack-001',
            catalogItemId: 'cat-laptop-001',
            quantity: 1,
            order: 1,
            catalogItem: { id: 'cat-laptop-001', brand: 'Lenovo', model: 'ThinkBook', category: 'pc_portable' },
          },
          {
            id: 'pack-item-002',
            packId: 'pack-001',
            catalogItemId: 'cat-screen-001',
            quantity: 2,
            order: 2,
            catalogItem: { id: 'cat-screen-001', brand: 'Dell', model: 'UltraSharp', category: 'ecran' },
          },
        ],
      });

      await service.create(packDto, userId);

      const createCall = prisma.bon.create.mock.calls[0][0] as {
        data: { equipments: { create: Array<{ catalogItemId: string | null }> } };
      };
      const createdEquipments = createCall.data.equipments.create;
      // 1 laptop + 2 screens from pack = 3 total
      expect(createdEquipments).toHaveLength(3);
      expect(createdEquipments[0].catalogItemId).toBe('cat-laptop-001');
      expect(createdEquipments[1].catalogItemId).toBe('cat-screen-001');
      expect(createdEquipments[2].catalogItemId).toBe('cat-screen-001');
    });

    it('should throw NotFoundException when collaborateur not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, userId)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const bons = [draftBon(), activeBon()];

    beforeEach(() => {
      prisma.bon.findMany.mockResolvedValue(bons);
      prisma.bon.count.mockResolvedValue(2);
    });

    it('should return paginated bons', async () => {
      const result = await service.findAll({});

      expect(result).toEqual({ bons, total: 2, page: 1, limit: 20 });
      expect(prisma.bon.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.bon.count).toHaveBeenCalledTimes(1);
    });

    it('should filter by status', async () => {
      prisma.bon.findMany.mockResolvedValue([draftBon()]);
      prisma.bon.count.mockResolvedValue(1);

      await service.findAll({ status: 'draft' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { status?: string };
      };
      expect(findManyCall.where.status).toBe('draft');
    });

    it('should filter by filialeId', async () => {
      await service.findAll({ filialeId: 'filiale-001' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { filialeId?: string };
      };
      expect(findManyCall.where.filialeId).toBe('filiale-001');
    });

    it('should search by reference or collaborateur', async () => {
      await service.findAll({ search: 'BMD-2026' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR).toHaveLength(3);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return bon by id', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      const result = await service.findOne(bon.id);

      expect(result).toEqual(bon);
      expect(prisma.bon.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: bon.id } }),
      );
    });

    it('should throw NotFoundException for unknown id', async () => {
      prisma.bon.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a draft bon', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const updatedBon = { ...bon, notes: 'Updated notes' };
      prisma.bon.update.mockResolvedValue(updatedBon);

      const result = await service.update(bon.id, { notes: 'Updated notes' });

      expect(result.notes).toBe('Updated notes');
      expect(prisma.bon.update).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException when bon is not draft', async () => {
      prisma.bon.findUnique.mockResolvedValue(activeBon());

      await expect(
        service.update('bon-active-001', { notes: 'Should fail' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update equipments (delete old, create new)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.deleteMany.mockResolvedValue({ count: 3 });
      prisma.bon.update.mockResolvedValue(bon);

      const newEquipments = [
        { catalogItemId: 'cat-laptop-001', serialNumber: 'SN-NEW-001' },
      ];
      await service.update(bon.id, { equipments: newEquipments });

      expect(prisma.bonEquipment.deleteMany).toHaveBeenCalledWith({
        where: { bonId: bon.id },
      });
      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            equipments: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ catalogItemId: 'cat-laptop-001' }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ── send ────────────────────────────────────────────────────────────────────

  describe('send', () => {
    const initiatedById = 'user-tech-001';

    it('should send a draft bon (status -> sent_mise_dispo)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const sentBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.update.mockResolvedValue(sentBon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.send(bon.id, initiatedById);

      expect(result.status).toBe('sent_mise_dispo');
      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'sent_mise_dispo' },
        }),
      );
    });

    it('should throw BadRequestException if not draft', async () => {
      prisma.bon.findUnique.mockResolvedValue(activeBon());

      await expect(service.send('bon-active-001', initiatedById)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if no equipments', async () => {
      const bon = { ...draftBon(), equipments: [] };
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate signature token', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'sent_mise_dispo' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.send(bon.id, initiatedById);

      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'mise_disposition',
        initiatedById,
        false,
      );
    });

    it('should call notification service', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const sentBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.update.mockResolvedValue(sentBon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.send(bon.id, initiatedById);

      expect(notificationService.sendMiseDispositionRequest).toHaveBeenCalledWith(
        sentBon,
        'mock-token-uuid',
      );
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    const userId = 'user-tech-001';

    it('should cancel a bon', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const cancelledResult = { ...bon, status: 'cancelled' as const };
      prisma.bon.update.mockResolvedValue(cancelledResult);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.cancel(bon.id, userId);

      expect(result.status).toBe('cancelled');
      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'bon_cancelled' }),
        }),
      );
    });

    it('should throw for archived bons', async () => {
      prisma.bon.findUnique.mockResolvedValue(archivedBon());

      await expect(service.cancel('bon-archived-001', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for cancelled bons', async () => {
      prisma.bon.findUnique.mockResolvedValue(cancelledBon());

      await expect(service.cancel('bon-cancelled-001', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for contested bons', async () => {
      prisma.bon.findUnique.mockResolvedValue(contestedBon());

      await expect(service.cancel('bon-contested-001', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should invalidate unsigned tokens', async () => {
      const bon = sentMiseDispoBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'cancelled' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.cancel(bon.id, userId);

      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
    });
  });

  // ── initiateRestitution ─────────────────────────────────────────────────────

  describe('initiateRestitution', () => {
    const initiatedById = 'user-tech-001';

    it('should initiate restitution on active bon', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      prisma.bonEquipment.count.mockResolvedValue(0);
      const updatedBon = { ...bon, status: 'sent_restitution' as const };
      prisma.bon.update.mockResolvedValue(updatedBon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.initiateRestitution(
        bon.id,
        initiatedById,
        ['equip-001', 'equip-002', 'equip-003'],
      );

      expect(result.status).toBe('sent_restitution');
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'restitution',
        initiatedById,
        false,
      );
    });

    it('should mark selected equipments as returned', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 2 });
      prisma.bonEquipment.count.mockResolvedValue(1);
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'partially_returned' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.initiateRestitution(bon.id, initiatedById, ['equip-001', 'equip-002']);

      expect(prisma.bonEquipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['equip-001', 'equip-002'] },
            bonId: bon.id,
            returnedAt: null,
            notReturned: false,
          }),
        }),
      );
    });

    it('should set status to sent_restitution when all returned', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      prisma.bonEquipment.count.mockResolvedValue(0); // none remaining
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'sent_restitution' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.initiateRestitution(bon.id, initiatedById, ['equip-001', 'equip-002', 'equip-003']);

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'sent_restitution' },
        }),
      );
    });

    it('should set status to partially_returned when some remain', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.count.mockResolvedValue(2); // 2 remaining
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'partially_returned' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.initiateRestitution(bon.id, initiatedById, ['equip-001']);

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'partially_returned' },
        }),
      );
    });

    it('should throw if bon not active/partially_returned', async () => {
      prisma.bon.findUnique.mockResolvedValue(draftBon());

      await expect(
        service.initiateRestitution('bon-draft-001', initiatedById),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── declareNotReturned ──────────────────────────────────────────────────────

  describe('declareNotReturned', () => {
    const userId = 'user-tech-001';
    const reason = 'Equipement perdu';
    const signatureDataUrl = 'data:image/png;base64,abc123';

    it('should mark equipments as not returned', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      // $transaction callback will use the prisma mock itself
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.bonEquipment.count.mockResolvedValue(2); // some still pending
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'partially_returned' as const });

      await service.declareNotReturned(bon.id, ['equip-001'], reason, userId);

      expect(prisma.bonEquipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notReturned: true, notReturnedReason: reason },
        }),
      );
    });

    it('should create PV and send email when all resolved', async () => {
      const bon = activeBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne in declareNotReturned
        .mockResolvedValueOnce(bon); // findOne at end
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.bonEquipment.count.mockResolvedValue(0); // all resolved
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'partially_returned' as const });
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await service.declareNotReturned(
        bon.id,
        ['equip-001'],
        reason,
        userId,
        signatureDataUrl,
      );

      expect(signatureService.saveItPvSignature).toHaveBeenCalledWith(
        bon.id,
        signatureDataUrl,
        technicianUser().email,
        userId,
      );
      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.anything(),
        'cloture_equipements_manquants',
        expect.objectContaining({ it: signatureDataUrl, collab: null }),
        expect.stringContaining('cloture_equipements_manquants'),
      );
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'pv_cloture',
        userId,
        false,
      );
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
    });

    it('should throw if no equipment selected', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.declareNotReturned(bon.id, [], reason, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── markFound ───────────────────────────────────────────────────────────────

  describe('markFound', () => {
    const userId = 'user-tech-001';
    const signatureDataUrl = 'data:image/png;base64,abc123';

    it('should mark not-returned equipment as found', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne at start
        .mockResolvedValueOnce(bon); // findOne at end
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValue(0); // no more not-returned
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'sent_restitution' as const });

      await service.markFound(bon.id, ['equip-002'], userId, signatureDataUrl);

      expect(prisma.bonEquipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['equip-002'] },
            notReturned: true,
          }),
          data: expect.objectContaining({
            notReturned: false,
            notReturnedReason: null,
          }),
        }),
      );
    });

    it('should generate avenant PDF for archived bon', async () => {
      const bon = archivedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne at start
        .mockResolvedValueOnce(bon); // findOne at end
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await service.markFound(bon.id, ['equip-001'], userId, signatureDataUrl);

      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.objectContaining({ _avenantEquipmentIds: ['equip-001'] }),
        'avenant_equipement_retrouve',
        expect.objectContaining({ it: signatureDataUrl, collab: null }),
        expect.stringContaining('avenant_equipement_retrouve'),
      );
      expect(smbService.exportPdf).toHaveBeenCalled();
    });

    it('should advance to sent_restitution when all found', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon)
        .mockResolvedValueOnce(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValue(0); // no more not-returned
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'sent_restitution' as const });

      await service.markFound(bon.id, ['equip-002'], userId);

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'sent_restitution' },
        }),
      );
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'restitution',
        userId,
        false,
      );
      expect(notificationService.sendRestitutionRequest).toHaveBeenCalled();
    });

    it('should regenerate PV when some still not returned', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon)
        .mockResolvedValueOnce(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValue(1); // still 1 not-returned

      await service.markFound(bon.id, ['equip-002'], userId, signatureDataUrl);

      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.anything(),
        'cloture_equipements_manquants',
        expect.objectContaining({ it: signatureDataUrl, collab: null }),
        expect.stringContaining('cloture_equipements_manquants'),
      );
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'pv_cloture',
        userId,
        false,
      );
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
    });
  });

  // ── initiateInPersonSignature ───────────────────────────────────────────────

  describe('initiateInPersonSignature', () => {
    const initiatedById = 'user-tech-001';

    it('should return in-person token for mise_disposition', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const updatedBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.update.mockResolvedValue(updatedBon);

      const result = await service.initiateInPersonSignature(
        bon.id,
        'mise_disposition',
        initiatedById,
      );

      expect(result.bon.status).toBe('sent_mise_dispo');
      expect(result.token).toBe('mock-token-uuid');
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'mise_disposition',
        initiatedById,
        true,
      );
    });

    it('should return in-person token for restitution', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      const updatedBon = { ...bon, status: 'sent_restitution' as const };
      prisma.bon.update.mockResolvedValue(updatedBon);

      const result = await service.initiateInPersonSignature(
        bon.id,
        'restitution',
        initiatedById,
      );

      expect(result.bon.status).toBe('sent_restitution');
      expect(result.token).toBe('mock-token-uuid');
      // Should mark all unprocessed equipment as returned
      expect(prisma.bonEquipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bonId: bon.id,
            returnedAt: null,
            notReturned: false,
          }),
        }),
      );
    });

    it('should throw for invalid status', async () => {
      const bon = archivedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.initiateInPersonSignature(bon.id, 'mise_disposition', initiatedById),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── resendSignatureLink ─────────────────────────────────────────────────────

  describe('resendSignatureLink', () => {
    const initiatedById = 'user-tech-001';

    it('should resend signature link', async () => {
      const bon = sentMiseDispoBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst.mockResolvedValue(null); // no recent token
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLink(bon.id, initiatedById);

      expect(result).toEqual({ ok: true, message: 'Lien renvoyé avec succès' });
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'mise_disposition',
        initiatedById,
        false,
      );
      expect(notificationService.sendMiseDispositionRequest).toHaveBeenCalled();
    });

    it('should throw ConflictException for recent token (without force)', async () => {
      const bon = sentMiseDispoBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst.mockResolvedValue({
        id: 'sig-recent',
        createdAt: new Date(),
        token: 'recent-token',
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        signed: false,
        bonId: bon.id,
        type: 'mise_disposition',
        signatureImagePath: null,
        signedAt: null,
        signerEmail: null,
        signerIp: null,
        signerUserAgent: null,
        mentionLuApprouve: false,
        isInPerson: false,
        initiatedById,
      });

      await expect(
        service.resendSignatureLink(bon.id, initiatedById),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow resend with force=true', async () => {
      const bon = sentMiseDispoBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLink(bon.id, initiatedById, true);

      expect(result.ok).toBe(true);
      // Should NOT check for recent token when force=true
      expect(prisma.signature.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── getStats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return dashboard statistics', async () => {
      prisma.bon.count
        .mockResolvedValueOnce(5) // waitingSignature
        .mockResolvedValueOnce(10) // active
        .mockResolvedValueOnce(2) // overdue
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(3); // archivedThisMonth
      prisma.filiale.findMany.mockResolvedValue([
        {
          id: 'filiale-001',
          displayName: 'Filiale Demo',
          _count: { bons: 8 },
        },
        {
          id: 'filiale-002',
          displayName: 'Filiale Vide',
          _count: { bons: 0 },
        },
      ]);

      const stats = await service.getStats();

      expect(stats).toEqual({
        waitingSignature: 5,
        active: 10,
        overdue: 2,
        total: 20,
        archivedThisMonth: 3,
        byFiliale: [{ id: 'filiale-001', name: 'Filiale Demo', count: 8 }],
      });
      // Filiale with 0 bons should be filtered out
      expect(stats.byFiliale).toHaveLength(1);
    });
  });
});
