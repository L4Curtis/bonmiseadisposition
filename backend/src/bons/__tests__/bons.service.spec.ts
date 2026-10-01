import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { BonsService } from '../bons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { AppConfigService } from '../../config/config.service';
import { DomainEventsPublisher } from '../../common/events';
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
import { ConfigRegistryService } from '../../config/config-registry.service';

// Vraie image PNG 1x1 valide (magic bytes corrects) — assertPngDataUrl (LOT A1
// correction #6) rejette désormais un faux base64 comme l'ancien 'abc123'.
const VALID_SIGNATURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Façade BonsService, parties sans base de données (doublures Prisma) : portail,
 * duplication, export. Le cycle de vie (création, envoi, restitution, renvoi,
 * annulation…) est vérifié sur une vraie base par les tests de contrat
 * (test/contract/bon-workflow.contract.ts et test/contract/lifecycle/*).
 */
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
        { provide: ConfigRegistryService, useValue: new ConfigRegistryService(configService as never) },
        { provide: DomainEventsPublisher, useValue: { publish: vi.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<BonsService>(BonsService);
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

      const sig = result.items[0].signatures[0] as { token?: string; inPersonPending?: boolean };
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

      const sig = result.items[0].signatures[0] as { token?: string; inPersonPending?: boolean };
      expect(sig.token).toBe('remote-token');
      expect(sig.inPersonPending).toBeUndefined();
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
});
