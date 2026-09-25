import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { BonsService } from '../bons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { AppConfigService } from '../../config/config.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import {
  createMockNotificationService,
  createMockSignatureService,
  createMockPdfService,
  createMockSmbService,
  createMockConfigService,
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
import { collaboratorUser, technicianUser, manualAccountUser } from '../../common/__tests__/fixtures/user.fixtures';
import { BonStatus } from '../../common/types';
import { BON_LIST_SELECT } from '../queries/bon-list-select';

// Vraie image PNG 1x1 valide (magic bytes corrects) — assertPngDataUrl (LOT A1
// correction #6) rejette désormais un faux base64 comme l'ancien 'abc123'.
const VALID_SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('BonsService', () => {
  let service: BonsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let signatureService: ReturnType<typeof createMockSignatureService>;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let pdfService: ReturnType<typeof createMockPdfService>;
  let smbService: ReturnType<typeof createMockSmbService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    signatureService = createMockSignatureService();
    notificationService = createMockNotificationService();
    pdfService = createMockPdfService();
    smbService = createMockSmbService();
    configService = createMockConfigService();

    // Défauts partagés par (quasi) tous les tests — LOT A2 a ajouté des
    // vérifications (filiale/collaborateur/catalogue actifs, conflits de
    // série, création directe de token PV sous verrou advisory) qui touchent
    // des méthodes Prisma non mockées jusqu'ici dans chaque describe. Un test
    // qui a besoin d'un scénario différent (filiale inactive, collaborateur
    // désactivé, catalogue introuvable…) écrase l'un de ces défauts localement.
    prisma.user.findUnique.mockResolvedValue(collaboratorUser());
    prisma.filiale.findUnique.mockResolvedValue({ id: 'filiale-001', active: true });
    prisma.equipmentCatalog.findMany.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, active: true }))),
    );
    prisma.bonEquipment.findMany.mockResolvedValue([]);
    prisma.bonEquipment.count.mockResolvedValue(0);
    prisma.signature.findFirst.mockResolvedValue(null);
    // emitPvClotureIfDue (LOT A2, correction #C1) crée le token pv_cloture
    // directement via tx.signature.create (verrou advisory) — plus via
    // signatureService.generateToken.
    prisma.signature.create.mockResolvedValue({ token: 'mock-generated-pv-token' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SignatureService, useValue: signatureService },
        { provide: NotificationService, useValue: notificationService },
        { provide: PdfService, useValue: pdfService },
        { provide: SmbService, useValue: smbService },
        { provide: AppConfigService, useValue: configService },
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
      // generateReference uses $transaction + $executeRaw + $queryRaw (numeric MAX)
      prisma.$executeRaw.mockResolvedValue(undefined);
      prisma.$queryRaw.mockResolvedValue([{ max: null }]);
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
        active: true,
        items: [
          {
            id: 'pack-item-001',
            packId: 'pack-001',
            catalogItemId: 'cat-laptop-001',
            quantity: 1,
            order: 1,
            catalogItem: { id: 'cat-laptop-001', brand: 'Lenovo', model: 'ThinkBook', category: 'pc_portable', active: true },
          },
          {
            id: 'pack-item-002',
            packId: 'pack-001',
            catalogItemId: 'cat-screen-001',
            quantity: 2,
            order: 2,
            catalogItem: { id: 'cat-screen-001', brand: 'Dell', model: 'UltraSharp', category: 'ecran', active: true },
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

    it('should create a bon for a collaborator without an email address (manual account)', async () => {
      prisma.user.findUnique.mockResolvedValue(manualAccountUser());
      prisma.bon.create.mockResolvedValue({ ...draftBon(), collaborateurEmail: null });

      await service.create(dto, userId);

      const createCall = prisma.bon.create.mock.calls[0][0] as {
        data: { collaborateurEmail: string | null };
      };
      expect(createCall.data.collaborateurEmail).toBeNull();
    });

    it('should throw BadRequestException when the collaborateur is deactivated (LOT A2)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...collaboratorUser(), active: false });

      await expect(service.create(dto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when the filiale does not exist or is inactive (LOT A2)', async () => {
      prisma.filiale.findUnique.mockResolvedValue({ id: dto.filialeId, active: false });

      await expect(service.create(dto, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when packId is unknown or inactive (LOT A2)', async () => {
      prisma.equipmentPack.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, packId: 'pack-unknown', equipments: undefined }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should ignore inactive catalog items when importing from a pack (LOT A2)', async () => {
      prisma.equipmentPack.findUnique.mockResolvedValue({
        id: 'pack-001',
        name: 'Pack Standard',
        active: true,
        items: [
          {
            id: 'pack-item-001',
            packId: 'pack-001',
            catalogItemId: 'cat-laptop-001',
            quantity: 1,
            order: 1,
            catalogItem: { id: 'cat-laptop-001', brand: 'Lenovo', model: 'ThinkBook', category: 'pc_portable', active: true },
          },
          {
            id: 'pack-item-002',
            packId: 'pack-001',
            catalogItemId: 'cat-old-001',
            quantity: 1,
            order: 2,
            catalogItem: { id: 'cat-old-001', brand: 'Old', model: 'Model', category: 'pc_fixe', active: false },
          },
        ],
      });

      await service.create({ ...dto, packId: 'pack-001', equipments: undefined }, userId);

      const createCall = prisma.bon.create.mock.calls[0][0] as {
        data: { equipments: { create: Array<{ catalogItemId: string | null }> } };
      };
      expect(createCall.data.equipments.create).toHaveLength(1);
      expect(createCall.data.equipments.create[0].catalogItemId).toBe('cat-laptop-001');
    });

    it('should throw BadRequestException listing unknown/inactive catalog item ids (LOT A2)', async () => {
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-laptop-001', active: false }]);

      await expect(service.create(dto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on duplicate serial numbers within the same bon (LOT A2)', async () => {
      const dupDto = {
        ...dto,
        equipments: [
          { catalogItemId: 'cat-laptop-001', serialNumber: 'SN-DUP', order: 0 },
          { catalogItemId: 'cat-screen-001', serialNumber: 'sn-dup', order: 1 },
        ],
      };

      await expect(service.create(dupDto, userId)).rejects.toThrow(BadRequestException);
    });

    it('should trim serial/inventory/customLabel and turn blanks into null (LOT A2)', async () => {
      const spacedDto = {
        ...dto,
        equipments: [
          { customLabel: '  Souris sans fil  ', serialNumber: '  ', inventoryNumber: '', order: 0 },
        ],
      };

      await service.create(spacedDto, userId);

      const createCall = prisma.bon.create.mock.calls[0][0] as {
        data: { equipments: { create: Array<Record<string, unknown>> } };
      };
      expect(createCall.data.equipments.create[0]).toMatchObject({
        customLabel: 'Souris sans fil',
        serialNumber: null,
        inventoryNumber: null,
      });
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

      await service.findAll({ status: ['draft' as BonStatus] });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { status?: { in: string[] } };
      };
      expect(findManyCall.where.status).toEqual({ in: ['draft'] });
    });

    it('should combine status and excludeStatus filters', async () => {
      await service.findAll({
        status: ['draft' as BonStatus, 'active' as BonStatus],
        excludeStatus: ['cancelled' as BonStatus],
      });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { status?: { in: string[]; notIn: string[] } };
      };
      expect(findManyCall.where.status).toEqual({
        in: ['draft', 'active'],
        notIn: ['cancelled'],
      });
    });

    it('should also match equipment serial and inventory numbers in free search', async () => {
      await service.findAll({ search: 'SN-1234' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      // Référence, nom, email, numéro de série, numéro d'inventaire : ce
      // dernier a été ajouté avec la fiche matériel, un numéro d'inventaire
      // devant se chercher comme un numéro de série.
      expect(findManyCall.where.OR).toHaveLength(5);
      expect(findManyCall.where.OR).toEqual(
        expect.arrayContaining([
          { equipments: { some: { serialNumber: { contains: 'SN-1234', mode: 'insensitive' } } } },
          { equipments: { some: { inventoryNumber: { contains: 'SN-1234', mode: 'insensitive' } } } },
        ]),
      );
    });

    it('should filter by filialeId', async () => {
      await service.findAll({ filialeId: 'filiale-001' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { filialeId?: string };
      };
      expect(findManyCall.where.filialeId).toBe('filiale-001');
    });

    it('should search by reference, collaborateur or serial number', async () => {
      await service.findAll({ search: 'BMD-2026' });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(findManyCall.where.OR).toBeDefined();
      expect(findManyCall.where.OR).toHaveLength(5);
    });

    it('uses the lightweight list projection, not the full bon select', async () => {
      await service.findAll({});

      const call = prisma.bon.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
      expect(call.select).toBe(BON_LIST_SELECT);
      // Pas de colonnes inutiles à la liste (notes, fiche filiale complète…)
      expect(call.select).not.toHaveProperty('notes');
      expect(call.select.filiale).toEqual({ select: { id: true, displayName: true } });
    });

    it('sorts by createdAt desc with an id tiebreak by default', async () => {
      await service.findAll({});

      const call = prisma.bon.findMany.mock.calls[0][0] as { orderBy: unknown };
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('applies the requested sort with a stable tiebreak', async () => {
      await service.findAll({ sort: 'collaborateur', order: 'asc', page: 3, limit: 25 });

      const call = prisma.bon.findMany.mock.calls[0][0] as { orderBy: unknown; skip: number; take: number };
      expect(call.orderBy).toEqual([{ collaborateur: { displayName: 'asc' } }, { id: 'asc' }]);
      expect(call.skip).toBe(50);
      expect(call.take).toBe(25);
    });

    it('should apply the overdue filter (LOT A2)', async () => {
      await service.findAll({ overdue: true });

      const findManyCall = prisma.bon.findMany.mock.calls[0][0] as {
        where: { AND?: Array<{ updatedAt?: unknown; OR?: unknown[] }> };
      };
      expect(findManyCall.where.AND).toHaveLength(1);
      expect(findManyCall.where.AND?.[0].OR).toHaveLength(2);
      expect(findManyCall.where.AND?.[0].updatedAt).toBeDefined();
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
    beforeEach(() => {
      // LOT A2 (correction) : le statut est désormais claim conditionnel via
      // tx.bon.updateMany (comme partout ailleurs), plus tx.bon.findUnique.
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
    });

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

    it('should clear dateRestitution when explicitly set to null (LOT A2)', async () => {
      const bon = { ...draftBon(), dateRestitution: new Date('2026-03-01') };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.update.mockResolvedValue({ ...bon, dateRestitution: null });

      await service.update(bon.id, { dateRestitution: null });

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dateRestitution: null }) }),
      );
    });

    it('should leave dateRestitution unchanged when omitted (undefined)', async () => {
      const bon = { ...draftBon(), dateRestitution: new Date('2026-03-01') };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.update.mockResolvedValue(bon);

      await service.update(bon.id, { notes: 'Just notes' });

      const call = prisma.bon.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('dateRestitution');
    });

    it('should clear notes when set to an empty string', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.update.mockResolvedValue({ ...bon, notes: null });

      await service.update(bon.id, { notes: '' });

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notes: null }) }),
      );
    });

    it('should throw NotFoundException when filiale does not exist or is inactive (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.filiale.findUnique.mockResolvedValue({ id: 'filiale-002', active: false });

      await expect(
        service.update(bon.id, { filialeId: 'filiale-002' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException listing unknown/inactive catalog item ids (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-bad-001', active: false }]);

      await expect(
        service.update(bon.id, { equipments: [{ catalogItemId: 'cat-bad-001' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on duplicate serial numbers within the same bon (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.update(bon.id, {
          equipments: [
            { catalogItemId: 'cat-laptop-001', serialNumber: 'SN-DUP' },
            { catalogItemId: 'cat-screen-001', serialNumber: ' sn-dup ' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the collaborateur is deactivated (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue({ ...collaboratorUser(), active: false });

      await expect(
        service.update(bon.id, { collaborateurId: 'user-collab-002' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when the transition raced (bon sent concurrently, LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(bon.id, { notes: 'too late' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.bon.update).not.toHaveBeenCalled();
    });
  });

  // ── send ────────────────────────────────────────────────────────────────────

  describe('send', () => {
    const initiatedById = 'user-tech-001';

    it('should send a draft bon (status -> sent_mise_dispo)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const sentBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(sentBon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.send(bon.id, initiatedById);

      expect(result.status).toBe('sent_mise_dispo');
      // Conditional transition: only a bon still in draft is updated
      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: 'draft' },
        data: { status: 'sent_mise_dispo' },
      });
    });

    it('should throw ConflictException when the transition raced (already sent)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(ConflictException);
      expect(signatureService.generateToken).not.toHaveBeenCalled();
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
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'sent_mise_dispo' as const });
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
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(sentBon);
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.send(bon.id, initiatedById);

      expect(notificationService.sendMiseDispositionRequest).toHaveBeenCalledWith(
        sentBon,
        'mock-token-uuid',
      );
    });

    it('should throw BadRequestException when the collaborator is deactivated (assertSendable, LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue({ ...collaboratorUser(), active: false });

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should refuse to send when the collaborator email is not deliverable (ex. admin@local)', async () => {
      const bon = { ...draftBon(), collaborateurEmail: 'admin@local' };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue(collaboratorUser());

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(/signature présentielle/);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should refuse to send by email when the collaborator has no email address (manual account) and suggest the in-person signature', async () => {
      const bon = { ...draftBon(), collaborateurEmail: null };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue(manualAccountUser());

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(/signature présentielle/);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the filiale is inactive (assertSendable, LOT A2)', async () => {
      const bon = { ...draftBon(), filiale: { ...draftBon().filiale, active: false } };
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(service.send(bon.id, initiatedById)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should return 409 serial_conflicts when a serial number is already in circulation elsewhere (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.findMany.mockResolvedValue([
        {
          serialNumber: 'SN-LP-2026-001',
          bon: { id: 'bon-other-001', reference: 'BON-2026-0099' },
        },
      ] as never);

      await expect(service.send(bon.id, initiatedById)).rejects.toMatchObject({
        response: {
          code: 'serial_conflicts',
          conflicts: [{ serialNumber: 'SN-LP-2026-001', bonReference: 'BON-2026-0099' }],
        },
      });
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should send despite serial conflicts when confirmSerialConflicts is true, and audit it (LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.findMany.mockResolvedValue([
        {
          serialNumber: 'SN-LP-2026-001',
          bon: { id: 'bon-other-001', reference: 'BON-2026-0099' },
        },
      ] as never);
      const sentBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(sentBon);

      const result = await service.send(bon.id, initiatedById, true);

      expect(result.status).toBe('sent_mise_dispo');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'bon_sent_with_serial_conflicts',
            details: expect.objectContaining({
              conflicts: [{ serialNumber: 'SN-LP-2026-001', bonReference: 'BON-2026-0099' }],
            }),
          }),
        }),
      );
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    const userId = 'user-tech-001';

    it('should cancel a bon', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      // Transition conditionnelle : updateMany (gagne la course) + relecture
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'cancelled' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.cancel(bon.id, userId);

      expect(result.status).toBe('cancelled');
      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: { in: ['draft', 'sent_mise_dispo'] } },
        data: { status: 'cancelled' },
      });
      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'bon_cancelled' }),
        }),
      );
    });

    it('should refuse to cancel a bon that has already been signed (LOT A2)', async () => {
      prisma.bon.findUnique.mockResolvedValue(activeBon());

      await expect(service.cancel('bon-active-001', userId)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.invalidateUnsignedTokens).not.toHaveBeenCalled();
    });

    it('should refuse to cancel a sent_restitution bon (LOT A2)', async () => {
      const bon = { ...sentMiseDispoBon(), status: 'sent_restitution' as const };
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(service.cancel(bon.id, userId)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should refuse to cancel a partially_returned bon (LOT A2)', async () => {
      prisma.bon.findUnique.mockResolvedValue(partiallyReturnedBon());

      await expect(service.cancel('bon-partial-001', userId)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should lose the race if status changed concurrently (Conflict)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel(bon.id, userId)).rejects.toThrow(ConflictException);
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
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'cancelled' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.cancel(bon.id, userId);

      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
    });
  });

  // ── initiateRestitution ─────────────────────────────────────────────────────

  describe('initiateRestitution', () => {
    const initiatedById = 'user-tech-001';

    // Trouvé par les tests de bout en bout : cette voie envoie un lien de
    // signature par email. Sans adresse délivrable, le bon basculait en
    // attente d'une signature impossible à demander, sans le moindre message.
    it('should refuse to initiate an email restitution when the address is not deliverable and suggest the in-person path', async () => {
      const bon = { ...activeBon(), collaborateurEmail: 'admin@local' };
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.initiateRestitution(bon.id, initiatedById, ['equip-001']),
      ).rejects.toThrow(/signature présentielle/);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should initiate restitution on active bon', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      const updatedBon = { ...bon, status: 'sent_restitution' as const };
      prisma.bon.findUniqueOrThrow.mockResolvedValue(updatedBon);
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
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'partially_returned' as const });
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
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'sent_restitution' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.initiateRestitution(bon.id, initiatedById, ['equip-001', 'equip-002', 'equip-003']);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: { in: ['active', 'partially_returned'] } },
        data: { status: 'sent_restitution' },
      });
    });

    it('should set status to partially_returned when some remain', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.count.mockResolvedValue(2); // 2 remaining
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'partially_returned' as const });
      prisma.auditLog.create.mockResolvedValue({} as never);

      await service.initiateRestitution(bon.id, initiatedById, ['equip-001']);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: { in: ['active', 'partially_returned'] } },
        data: { status: 'partially_returned' },
      });
    });

    it('should throw if bon not active/partially_returned', async () => {
      prisma.bon.findUnique.mockResolvedValue(draftBon());

      await expect(
        service.initiateRestitution('bon-draft-001', initiatedById),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when no equipment id is provided (LOT A1 correction #3)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.initiateRestitution(bon.id, initiatedById, []),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when some ids are invalid (LOT A1 correction #9)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      // 1 of 2 requested ids actually matched (not already returned / belongs to bon)
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.initiateRestitution(bon.id, initiatedById, ['equip-001', 'equip-bogus']),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the transition raced (LOT A1 correction #10)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.initiateRestitution(bon.id, initiatedById, ['equip-001']),
      ).rejects.toThrow(ConflictException);
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });
  });

  // ── declareNotReturned ──────────────────────────────────────────────────────

  describe('declareNotReturned', () => {
    const userId = 'user-tech-001';
    const reason = 'Equipement perdu';
    const signatureDataUrl = VALID_SIGNATURE_DATA_URL;

    it('should mark equipments as not returned', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      // $transaction callback will use the prisma mock itself
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.bonEquipment.count.mockResolvedValue(2); // some still pending
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.signature.findFirst.mockResolvedValue(null); // no pending restitution signature

      await service.declareNotReturned(bon.id, ['equip-001'], reason, userId);

      expect(prisma.bonEquipment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notReturned: true, notReturnedReason: reason },
        }),
      );
    });

    it('should create PV and send email when all resolved', async () => {
      const bon = activeBon();
      const bonPartial = { ...bon, status: 'partially_returned' as const };
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne in declareNotReturned (still 'active')
        .mockResolvedValue(bonPartial); // emitPvClotureIfDue reload + final findOne
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.signature.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      // Ordre des appels bonEquipment.count : [remaining (tx)=0, pending (emitPvClotureIfDue)=0, notReturnedCount (emitPvClotureIfDue)=1]
      prisma.bonEquipment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

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
      // LOT A2 (correction #C1) : le token pv_cloture est désormais créé
      // directement via tx.signature.create (verrou advisory), plus via
      // signatureService.generateToken.
      expect(prisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon.id, type: 'pv_cloture', initiatedById: userId }),
        }),
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

    it('should throw BadRequestException for an invalid signature image before writing anything (LOT A1 correction #6)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.declareNotReturned(bon.id, ['equip-001'], reason, userId, 'data:image/png;base64,not-a-real-png'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when a restitution signature is pending (LOT A1 correction #4)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst.mockResolvedValue({
        id: 'sig-pending-restit',
        type: 'restitution',
        signed: false,
      } as never);

      await expect(
        service.declareNotReturned(bon.id, ['equip-001'], reason, userId),
      ).rejects.toThrow(ConflictException);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── markFound ───────────────────────────────────────────────────────────────

  describe('markFound', () => {
    const userId = 'user-tech-001';
    const signatureDataUrl = VALID_SIGNATURE_DATA_URL;

    it('should mark not-returned equipment as found', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne at start
        .mockResolvedValueOnce(bon); // findOne at end
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValue(0); // no more pending / not-returned
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.signature.findFirst.mockResolvedValue(null);

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
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.signature.findMany.mockResolvedValue([]);

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
      prisma.bonEquipment.count.mockResolvedValue(0); // no more pending / not-returned
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.signature.findFirst.mockResolvedValue(null);

      await service.markFound(bon.id, ['equip-002'], userId);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: 'partially_returned' },
        data: { status: 'sent_restitution' },
      });
      expect(signatureService.generateToken).toHaveBeenCalledWith(
        bon.id,
        'restitution',
        userId,
        false,
      );
      expect(notificationService.sendRestitutionRequest).toHaveBeenCalled();
    });

    it('should regenerate PV when nothing pending but some still not returned', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon)
        .mockResolvedValue(bon); // emitPvClotureIfDue reload + final findOne
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.signature.findMany.mockResolvedValue([]);
      // Ordre des appels bonEquipment.count : [pending(tx)=0, stillNotReturned(tx)=1, pending(emitPvClotureIfDue)=0, notReturnedCount(emitPvClotureIfDue)=1]
      prisma.bonEquipment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      await service.markFound(bon.id, ['equip-002'], userId, signatureDataUrl);

      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.anything(),
        'cloture_equipements_manquants',
        expect.objectContaining({ it: signatureDataUrl, collab: null }),
        expect.stringContaining('cloture_equipements_manquants'),
      );
      // LOT A2 (correction #C1) : création directe via tx.signature.create.
      expect(prisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon.id, type: 'pv_cloture', initiatedById: userId }),
        }),
      );
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
    });

    it('should keep partially_returned and emit nothing when other equipment is still pending restitution (LOT A1 correction #1)', async () => {
      const base = partiallyReturnedBon();
      // Simulate a 3rd equipment never processed by initiateRestitution (neither returned nor declared lost)
      const bon = { ...base, equipments: base.equipments.map((e, i) => (i === 2 ? { ...e, returnedAt: null } : e)) };
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon)
        .mockResolvedValueOnce(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 1 });
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.signature.findFirst.mockResolvedValue(null);
      // pending(tx)=1 (equip-003 still pending) — short-circuits before stillNotReturned matters
      prisma.bonEquipment.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await service.markFound(bon.id, ['equip-002'], userId, signatureDataUrl);

      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
      expect(pdfService.generateAndSave).not.toHaveBeenCalled();
      expect(signatureService.saveItPvSignature).toHaveBeenCalledWith(
        bon.id,
        signatureDataUrl,
        technicianUser().email,
        userId,
      );
    });

    it('should throw ConflictException when a restitution signature is pending (LOT A1 correction #4)', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst.mockResolvedValue({
        id: 'sig-pending-restit',
        type: 'restitution',
        signed: false,
      } as never);

      await expect(
        service.markFound(bon.id, ['equip-002'], userId),
      ).rejects.toThrow(ConflictException);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for an invalid signature image before writing anything (LOT A1 correction #6)', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(
        service.markFound(bon.id, ['equip-002'], userId, 'data:image/png;base64,not-a-real-png'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── initiateInPersonSignature ───────────────────────────────────────────────

  describe('initiateInPersonSignature', () => {
    const initiatedById = 'user-tech-001';

    it('should return in-person token for mise_disposition', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      const updatedBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(updatedBon);

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
      // Depuis draft : audit bon_sent {inPerson:true} (LOT A2)
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'bon_sent', details: { inPerson: true } }),
        }),
      );
    });

    it('should allow in-person signature initiation when the collaborator has no email address (manual account)', async () => {
      const bon = { ...draftBon(), collaborateurEmail: null };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue(manualAccountUser());
      const updatedBon = { ...bon, status: 'sent_mise_dispo' as const };
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(updatedBon);

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

    it('should roll back equipment marking when the transition loses the race (LOT A2)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.initiateInPersonSignature(bon.id, 'restitution', initiatedById),
      ).rejects.toThrow(ConflictException);
      // Marquage + transition sont dans la MÊME transaction (LOT A2) : la
      // génération de token ne doit jamais être atteinte si elle a perdu la course.
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should return in-person token for restitution', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.updateMany.mockResolvedValue({ count: 3 });
      const updatedBon = { ...bon, status: 'sent_restitution' as const };
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.bon.findUniqueOrThrow.mockResolvedValue(updatedBon);

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

    it('should throw BadRequestException when the collaborator is deactivated (assertSendable, LOT A2)', async () => {
      const bon = draftBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.user.findUnique.mockResolvedValue({ ...collaboratorUser(), active: false });

      await expect(
        service.initiateInPersonSignature(bon.id, 'mise_disposition', initiatedById),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should refuse in-person restitution when a PV de clôture is due (LOT A2)', async () => {
      const bon = partiallyReturnedBon(); // pending=0, notReturned=1 (equip-002)
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prisma.signature.findFirst.mockResolvedValue(null);

      await expect(
        service.initiateInPersonSignature(bon.id, 'restitution', initiatedById),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should refuse in-person restitution when a PV de clôture is already pending co-signature (LOT A2)', async () => {
      const bon = activeBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.signature.findFirst.mockResolvedValue({ id: 'sig-pv-pending', type: 'pv_cloture', signed: false } as never);

      await expect(
        service.initiateInPersonSignature(bon.id, 'restitution', initiatedById),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should reuse the existing pending in-person token on reinit instead of generating a new one (LOT A2)', async () => {
      const bon = sentMiseDispoBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst.mockResolvedValue({ token: 'existing-inperson-token' } as never);

      const result = await service.initiateInPersonSignature(bon.id, 'mise_disposition', initiatedById);

      expect(result.token).toBe('existing-inperson-token');
      expect(signatureService.generateToken).not.toHaveBeenCalled();
      expect(signatureService.invalidateUnsignedTokens).not.toHaveBeenCalled();
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── findByCollaborateur (LOT A2) ────────────────────────────────────────────

  describe('findByCollaborateur', () => {
    const userId = 'user-collab-001';

    it('should exclude draft bons', async () => {
      prisma.bon.findMany.mockResolvedValue([]);

      await service.findByCollaborateur(userId);

      const call = prisma.bon.findMany.mock.calls[0][0] as { where: { status: { notIn: string[] } } };
      expect(call.where.status.notIn).toEqual(expect.arrayContaining(['cancelled', 'draft']));
    });

    it('should mask the token of a pending in-person signature and expose inPersonPending instead', async () => {
      const bon = sentMiseDispoBon();
      const inPersonSig = {
        ...bon.signatures[0],
        isInPerson: true,
        token: 'secret-inperson-token',
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        signed: false,
      };
      prisma.bon.findMany.mockResolvedValue([{ ...bon, signatures: [inPersonSig] }]);

      const result = await service.findByCollaborateur(userId);

      const sig = result[0].signatures[0] as { token?: string; inPersonPending?: boolean };
      expect(sig.token).toBeUndefined();
      expect(sig.inPersonPending).toBe(true);
    });

    it('should still expose the token of a signable, non-in-person signature', async () => {
      const bon = sentMiseDispoBon();
      const remoteSig = {
        ...bon.signatures[0],
        isInPerson: false,
        token: 'remote-token',
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        signed: false,
      };
      prisma.bon.findMany.mockResolvedValue([{ ...bon, signatures: [remoteSig] }]);

      const result = await service.findByCollaborateur(userId);

      const sig = result[0].signatures[0] as { token?: string; inPersonPending?: boolean };
      expect(sig.token).toBe('remote-token');
      expect(sig.inPersonPending).toBeUndefined();
    });
  });

  // ── resendSignatureLink ─────────────────────────────────────────────────────

  describe('resendSignatureLink', () => {
    const initiatedById = 'user-tech-001';

    it('should refuse to resend when the collaborator has no email address (manual account)', async () => {
      const bon = { ...sentMiseDispoBon(), collaborateurEmail: null };
      prisma.bon.findUnique.mockResolvedValue(bon);

      await expect(service.resendSignatureLink(bon.id, initiatedById)).rejects.toThrow(
        /signature présentielle/,
      );
      expect(signatureService.invalidateUnsignedTokens).not.toHaveBeenCalled();
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

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

    it('should emit the PV via emitPvClotureIfDue when due and never generated before (LOT A1 correction #2c)', async () => {
      const bon = partiallyReturnedBon(); // equip-002 notReturned, equip-001/003 returned → pending=0, notReturned=1
      prisma.bon.findUnique
        .mockResolvedValueOnce(bon) // findOne in resendSignatureLink
        .mockResolvedValue(bon); // emitPvClotureIfDue reload
      // signature.findFirst is reused for: recentSig, everGenerated (none), existingPvToken (none)
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.signature.findMany.mockResolvedValue([]);
      prisma.bonEquipment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLink(bon.id, initiatedById);

      expect(result.ok).toBe(true);
      // LOT A2 : plus d'invalidateUnsignedTokens ici (hors verrou) —
      // emitPvClotureIfDue invalide déjà les autres tokens sous son propre
      // verrou advisory (cf. #C1 / relecture resendSignatureLink).
      expect(signatureService.invalidateUnsignedTokens).not.toHaveBeenCalled();
      // LOT A2 (correction #C1) : création directe via tx.signature.create.
      expect(prisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon.id, type: 'pv_cloture', initiatedById }),
        }),
      );
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.anything(),
        'cloture_equipements_manquants',
        expect.anything(),
        expect.stringContaining('cloture_equipements_manquants'),
      );
    });

    it('should just resend the pv_cloture token without regenerating the PDF when one was already issued', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      // 1st call: recentSig -> null ; 2nd call: everGenerated -> a past pv_cloture record exists
      prisma.signature.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'old-pv-sig', type: 'pv_cloture' } as never);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLink(bon.id, initiatedById);

      expect(result.ok).toBe(true);
      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
      expect(signatureService.generateToken).toHaveBeenCalledWith(bon.id, 'pv_cloture', initiatedById, false);
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
      expect(pdfService.generateAndSave).not.toHaveBeenCalled();
    });

    it('should throw when equipment is still pending and no restitution token exists (LOT A1 correction #2c)', async () => {
      const base = partiallyReturnedBon();
      // equip-003 never processed by initiateRestitution → still pending
      const bon = { ...base, equipments: base.equipments.map((e, i) => (i === 2 ? { ...e, returnedAt: null } : e)) };
      prisma.bon.findUnique.mockResolvedValue(bon);
      // 1st call: recentSig -> null ; 2nd call: pendingRestitutionSig -> none
      prisma.signature.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.resendSignatureLink(bon.id, initiatedById)).rejects.toThrow(
        BadRequestException,
      );
      expect(signatureService.invalidateUnsignedTokens).not.toHaveBeenCalled();
    });

    it('should resend the existing pending restitution token when equipment is still pending', async () => {
      const base = partiallyReturnedBon();
      const bon = { ...base, equipments: base.equipments.map((e, i) => (i === 2 ? { ...e, returnedAt: null } : e)) };
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.signature.findFirst
        .mockResolvedValueOnce(null) // recentSig
        .mockResolvedValueOnce({ id: 'sig-restit-pending', type: 'restitution', signed: false } as never); // pendingRestitutionSig
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLink(bon.id, initiatedById);

      expect(result.ok).toBe(true);
      expect(signatureService.invalidateUnsignedTokens).toHaveBeenCalledWith(bon.id);
      expect(signatureService.generateToken).toHaveBeenCalledWith(bon.id, 'restitution', initiatedById, false);
      expect(notificationService.sendRestitutionRequest).toHaveBeenCalled();
    });
  });

  // ── emitPvClotureIfDue (LOT A1 correction #2) ──────────────────────────────

  describe('emitPvClotureIfDue', () => {
    const actorId = 'user-tech-001';

    it('should return false when the bon is not partially_returned', async () => {
      prisma.bon.findUnique.mockResolvedValue(activeBon());

      const result = await service.emitPvClotureIfDue('bon-active-001', undefined, actorId);

      expect(result).toBe(false);
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should return false when equipment is still pending', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // pending=1

      const result = await service.emitPvClotureIfDue(bon.id, undefined, actorId);

      expect(result).toBe(false);
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('should return false (idempotent) when a pv_cloture token is already pending', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // pending=0, notReturned=1
      prisma.signature.findFirst.mockResolvedValue({ id: 'sig-existing-pv', type: 'pv_cloture' } as never);

      const result = await service.emitPvClotureIfDue(bon.id, undefined, actorId);

      expect(result).toBe(false);
      expect(signatureService.generateToken).not.toHaveBeenCalled();
      expect(prisma.signature.create).not.toHaveBeenCalled();
      expect(pdfService.generateAndSave).not.toHaveBeenCalled();
    });

    it('should emit the PV when due and no token is pending', async () => {
      const bon = partiallyReturnedBon();
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bonEquipment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // pending=0, notReturned=1
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.signature.findMany.mockResolvedValue([]);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.emitPvClotureIfDue(bon.id, undefined, actorId);

      expect(result).toBe(true);
      // LOT A2 (correction #C1) : verrou advisory + création directe via
      // tx.signature.create (plus via signatureService.generateToken).
      expect(prisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bonId: bon.id, type: 'pv_cloture', initiatedById: actorId }),
        }),
      );
      expect(notificationService.sendPvClotureRequest).toHaveBeenCalled();
      expect(pdfService.generateAndSave).toHaveBeenCalledWith(
        expect.anything(),
        'cloture_equipements_manquants',
        expect.objectContaining({ collab: null }),
        expect.stringContaining('cloture_equipements_manquants'),
      );
    });
  });

  // ── closeUnilaterally ───────────────────────────────────────────────────────

  describe('closeUnilaterally', () => {
    const userId = 'user-tech-001';
    const reason = 'Collaborateur parti de l\'entreprise, injoignable après 3 relances';

    function setupClose(bon: { id: string } & Record<string, unknown>) {
      prisma.bon.findUnique.mockResolvedValue(bon);
      prisma.bon.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(technicianUser());
      prisma.auditLog.create.mockResolvedValue({} as never);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);
      prisma.signature.findMany.mockResolvedValue([]);
    }

    it('should move sent_mise_dispo to active with audit + PDF + notice', async () => {
      const bon = sentMiseDispoBon();
      setupClose(bon);

      await service.closeUnilaterally(bon.id, userId, reason);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: 'sent_mise_dispo' },
        data: { status: 'active' },
      });
      // LOT A2 (correction #C2) : transition + invalidation des tokens dans
      // la MÊME transaction interactive (plus via signatureService.invalidateUnsignedTokens).
      expect(prisma.signature.updateMany).toHaveBeenCalledWith({
        where: { bonId: bon.id, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
        data: { tokenExpiresAt: new Date(0) },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'bon_closed_unilateral',
            details: expect.objectContaining({ from: 'sent_mise_dispo', to: 'active', reason }),
          }),
        }),
      );
      // Le document porte la mention de clôture unilatérale
      const pdfCall = pdfService.generateAndSave.mock.calls[0];
      expect((pdfCall[0] as { _unilateralNote?: string })._unilateralNote).toContain('CLÔTURE UNILATÉRALE');
      expect(pdfCall[1]).toBe('signature_collab_mise_disposition');
      expect(notificationService.sendUnilateralCloseNotice).toHaveBeenCalled();
    });

    it('should move sent_restitution to archived', async () => {
      const bon = { ...sentMiseDispoBon(), status: 'sent_restitution' as const };
      setupClose(bon);

      await service.closeUnilaterally(bon.id, userId, reason);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: 'sent_restitution' },
        data: { status: 'archived', archivedAt: expect.any(Date) },
      });
      expect(pdfService.generateAndSave.mock.calls[0][1]).toBe('signature_collab_restitution');
    });

    it('should archive a partially_returned bon only when all equipment is resolved', async () => {
      const bon = partiallyReturnedBon();
      setupClose(bon);
      prisma.bonEquipment.count.mockResolvedValue(0); // tout restitué ou déclaré non rendu

      await service.closeUnilaterally(bon.id, userId, reason);

      expect(prisma.bon.updateMany).toHaveBeenCalledWith({
        where: { id: bon.id, status: 'partially_returned' },
        data: { status: 'archived', archivedAt: expect.any(Date) },
      });
      expect(pdfService.generateAndSave.mock.calls[0][1]).toBe('cloture_equipements_manquants');
    });

    it('should refuse when partially_returned still has unresolved equipment', async () => {
      const bon = partiallyReturnedBon();
      setupClose(bon);
      prisma.bonEquipment.count.mockResolvedValue(2); // équipements ni rendus ni déclarés

      await expect(service.closeUnilaterally(bon.id, userId, reason)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.bon.updateMany).not.toHaveBeenCalled();
    });

    it('should refuse on a non-pending status', async () => {
      prisma.bon.findUnique.mockResolvedValue(activeBon());

      await expect(service.closeUnilaterally('bon-active-001', userId, reason)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should lose the race against a concurrent signature', async () => {
      const bon = sentMiseDispoBon();
      setupClose(bon);
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.closeUnilaterally(bon.id, userId, reason)).rejects.toThrow(
        ConflictException,
      );
      // LOT A1 correction #11 / LOT A2 correction #C2 : la transition
      // conditionnelle et l'invalidation des tokens sont dans la MÊME
      // transaction interactive ; quand la transition perd la course
      // (count=0 → Conflict), rien n'est invalidé (l'état gagnant garde un
      // lien valide), et aucun PDF ni notification ne part.
      expect(prisma.signature.updateMany).not.toHaveBeenCalled();
      expect(pdfService.generateAndSave).not.toHaveBeenCalled();
      expect(notificationService.sendUnilateralCloseNotice).not.toHaveBeenCalled();
    });
  });

  // ── duplicateAsDraft ────────────────────────────────────────────────────────

  describe('duplicateAsDraft', () => {
    it('should copy the bon as a new draft with a fresh reference', async () => {
      const source = activeBon();
      prisma.bon.findUnique.mockResolvedValue({ ...source, equipments: source.equipments });
      prisma.$executeRaw.mockResolvedValue(undefined);
      prisma.$queryRaw.mockResolvedValue([{ max: 42 }]);
      const created = { ...draftBon(), id: 'bon-new-001', reference: 'BON-2026-0043' };
      prisma.bon.create.mockResolvedValue(created);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.duplicateAsDraft(source.id, 'user-tech-001', {
        contestationId: 'contestation-001',
      });

      expect(result.reference).toBe('BON-2026-0043');
      const createArgs = prisma.bon.create.mock.calls[0][0] as {
        data: { collaborateurId: string; equipments: { create: unknown[] } };
      };
      expect(createArgs.data.collaborateurId).toBe(source.collaborateurId);
      expect(createArgs.data.equipments.create).toHaveLength(source.equipments.length);
      // Lien tracé dans l'audit des deux bons
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
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
        overdueThresholdDays: 7,
        byFiliale: [{ id: 'filiale-001', name: 'Filiale Demo', count: 8 }],
      });
      // Filiale with 0 bons should be filtered out
      expect(stats.byFiliale).toHaveLength(1);
    });

    it('should start « archivés ce mois-ci » on the 1st of the month in Paris', async () => {
      // 2026-02-28T23:30:00Z = 1er mars, 0 h 30 à Paris : le mois courant est
      // déjà mars, alors qu'il est encore février en UTC.
      vi.useFakeTimers().setSystemTime(new Date('2026-02-28T23:30:00Z'));
      try {
        prisma.bon.count.mockResolvedValue(0);
        prisma.filiale.findMany.mockResolvedValue([]);

        await service.getStats();

        // archivedThisMonth se base désormais sur archivedAt (jamais updatedAt).
        const archivedThisMonthCall = prisma.bon.count.mock.calls.find(
          (call) => (call[0] as { where?: { status?: string } })?.where?.status === 'archived',
        ) as [{ where: { archivedAt: { gte: Date } } }] | undefined;
        expect(archivedThisMonthCall).toBeDefined();
        expect(archivedThisMonthCall?.[0].where.archivedAt.gte.toISOString()).toBe('2026-02-28T23:00:00.000Z');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should read the overdue threshold from config and report it (overdueThresholdDays)', async () => {
      configService.getSignatureOverdueDays.mockResolvedValue(10);
      prisma.bon.count.mockResolvedValue(0);
      prisma.filiale.findMany.mockResolvedValue([]);

      const stats = await service.getStats();

      expect(stats.overdueThresholdDays).toBe(10);
      const overdueCountCall = prisma.bon.count.mock.calls.find(
        (call) => (call[0] as { where?: { AND?: unknown[] } })?.where?.AND !== undefined,
      ) as [{ where: { AND: Array<{ updatedAt: { lt: Date } }> } }] | undefined;
      expect(overdueCountCall).toBeDefined();
      // Le cutoff change avec le seuil configuré (10 j, pas 7)
      const cutoff = overdueCountCall?.[0].where.AND[0].updatedAt.lt;
      expect(cutoff).toBeInstanceOf(Date);
    });
  });

  // ── getExportData ───────────────────────────────────────────────────────────

  describe('getExportData', () => {
    it('should return the csv with truncated:false under the export limit', async () => {
      prisma.bon.findMany.mockResolvedValue([]);

      const result = await service.getExportData({});

      expect(result.truncated).toBe(false);
      expect(result.csv.startsWith('﻿')).toBe(true);
    });

    it('should report truncated:true and cap rows at 5000 when the limit is exceeded', async () => {
      const rows = Array.from({ length: 5001 }, (_, i) => ({
        ...draftBon(),
        id: `bon-${i}`,
        reference: `BON-2026-${String(i).padStart(4, '0')}`,
      }));
      prisma.bon.findMany.mockResolvedValue(rows as never);

      const result = await service.getExportData({});

      expect(result.truncated).toBe(true);
      // 1 header line + 5000 data lines
      expect(result.csv.split('\n')).toHaveLength(5001);
    });

    it('should export in the same order as the list (sort + id tiebreak)', async () => {
      prisma.bon.findMany.mockResolvedValue([]);

      await service.getExportData({ sort: 'reference', order: 'asc', ids: ['bon-1'] });

      const call = prisma.bon.findMany.mock.calls[0][0] as { orderBy: unknown; where: { id?: unknown } };
      expect(call.orderBy).toEqual([{ reference: 'asc' }, { id: 'asc' }]);
      expect(call.where.id).toEqual({ in: ['bon-1'] });
    });
  });

  // ── resendSignatureLinks (relance groupée) ──────────────────────────────────

  describe('resendSignatureLinks', () => {
    const initiatedById = 'user-tech-001';

    it('relance chaque bon l’un après l’autre et compte les envois', async () => {
      prisma.bon.findUnique.mockResolvedValue(sentMiseDispoBon());
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLinks(['bon-1', 'bon-2'], initiatedById);

      expect(result).toEqual({
        results: [{ id: 'bon-1', outcome: 'sent' }, { id: 'bon-2', outcome: 'sent' }],
        sent: 2,
        skipped: 0,
        failed: 0,
      });
      expect(signatureService.generateToken).toHaveBeenCalledTimes(2);
      // Même ligne d'audit que le bouton de la fiche, une par bon
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    });

    it('ne relance qu’une fois un identifiant répété', async () => {
      prisma.bon.findUnique.mockResolvedValue(sentMiseDispoBon());
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLinks(['bon-1', 'bon-1'], initiatedById);

      expect(result.results).toHaveLength(1);
      expect(signatureService.generateToken).toHaveBeenCalledTimes(1);
    });

    it('ignore (sans interrompre le lot) un bon relancé il y a moins d’une heure, avec sa date d’envoi', async () => {
      const sentAt = new Date(Date.now() - 10 * 60 * 1000);
      prisma.bon.findUnique.mockResolvedValue(sentMiseDispoBon());
      prisma.signature.findFirst
        .mockResolvedValueOnce({ id: 'sig-recent', createdAt: sentAt } as never)
        .mockResolvedValue(null);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLinks(['bon-recent', 'bon-ok'], initiatedById);

      expect(result.results[0]).toEqual({
        id: 'bon-recent',
        outcome: 'skipped',
        code: 'token_recent',
        reason: expect.stringContaining('moins d’une heure'),
        sentAt: sentAt.toISOString(),
      });
      expect(result.results[1]).toEqual({ id: 'bon-ok', outcome: 'sent' });
      expect(result).toEqual(expect.objectContaining({ sent: 1, skipped: 1, failed: 0 }));
    });

    it('avec force, relance même un lien récent (sans consulter les liens récents)', async () => {
      prisma.bon.findUnique.mockResolvedValue(sentMiseDispoBon());
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLinks(['bon-1'], initiatedById, true);

      expect(result.sent).toBe(1);
      expect(prisma.signature.findFirst).not.toHaveBeenCalled();
    });

    it('ignore avec son motif un bon qui n’est plus en attente, ou introuvable', async () => {
      prisma.bon.findUnique
        .mockResolvedValueOnce(activeBon())
        .mockResolvedValueOnce(null);

      const result = await service.resendSignatureLinks(['bon-actif', 'bon-absent'], initiatedById);

      expect(result.results[0]).toEqual({
        id: 'bon-actif',
        outcome: 'skipped',
        reason: expect.stringContaining('en attente de signature'),
      });
      expect(result.results[1]).toEqual({ id: 'bon-absent', outcome: 'skipped', reason: 'Bon introuvable' });
      expect(signatureService.generateToken).not.toHaveBeenCalled();
    });

    it('compte en échec une erreur imprévue, sans en divulguer le détail, et poursuit le lot', async () => {
      prisma.bon.findUnique.mockResolvedValue(sentMiseDispoBon());
      signatureService.generateToken
        .mockRejectedValueOnce(new Error('connexion perdue'))
        .mockResolvedValue({ token: 'tok' } as never);
      prisma.auditLog.create.mockResolvedValue({} as never);

      const result = await service.resendSignatureLinks(['bon-ko', 'bon-ok'], initiatedById);

      expect(result.results[0]).toEqual({ id: 'bon-ko', outcome: 'failed', reason: 'Erreur inattendue lors du renvoi' });
      expect(result.results[1].outcome).toBe('sent');
      expect(result).toEqual(expect.objectContaining({ sent: 1, failed: 1 }));
    });
  });
});
