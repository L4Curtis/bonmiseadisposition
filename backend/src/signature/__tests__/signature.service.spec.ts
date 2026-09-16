/**
 * Comprehensive unit tests for SignatureService.
 *
 * Covers: generateToken, getBonInfoByToken, sign, signItCachet,
 * getNextBonStatus (via sign), invalidateUnsignedTokens, getSignatureImagesForBon.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SignatureService } from '../signature.service';
import { TimestampService } from '../timestamp.service';
import { BONS_SERVICE } from '../../bons/bons.tokens';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../config/encryption.service';
import { AppConfigService } from '../../config/config.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import {
  createMockConfigService,
  createMockEncryptionService,
  createMockPdfService,
  createMockSmbService,
  createMockTimestampService,
} from '../../common/__tests__/helpers/mock-services';
import {
  sentMiseDispoBon,
  activeBon,
  cancelledBon,
  contestedBon,
  archivedBon,
  draftBon,
} from '../../common/__tests__/fixtures/bon.fixtures';

/**
 * Mock local de BonsService — pas de factory partagée dans
 * common/__tests__/helpers/mock-services.ts (hors périmètre du lot B) : la
 * dépendance est nouvelle (hook PV clôture après signature de restitution),
 * un simple objet jest.fn() suffit ici.
 */
function createMockBonsService() {
  return {
    emitPvClotureIfDue: jest.fn().mockResolvedValue(true),
  };
}

/**
 * BonsService n'est plus injecté au constructeur (ça formerait un cycle de
 * modules, cf. signature.module.ts) : SignatureService le résout
 * paresseusement via ModuleRef.get(BONS_SERVICE, { strict: false }) au moment
 * du hook. On mocke donc ModuleRef.get pour renvoyer le mock BonsService.
 */
function createMockModuleRef(bonsServiceMock: ReturnType<typeof createMockBonsService>) {
  return {
    get: jest.fn().mockReturnValue(bonsServiceMock),
  };
}

// ─── Mock fs module ──────────────────────────────────────────────────────────

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('encrypted:base64data'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

// ─── Deep-mock type alias ────────────────────────────────────────────────────
// createMockPrismaService returns jest.Mocked<PrismaService>, but strict mode
// does not recognise jest.fn() methods on deeply-nested Prisma delegates.
// We use a permissive record type that mirrors the mock shape at runtime.

type MockPrisma = Record<string, Record<string, jest.Mock> & { [k: string]: jest.Mock }> & {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SIGNER_EMAIL = 'jean.dupont@groupelivio.fr';
const SIGNER_IP = '10.0.0.42';
const SIGNER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/** What the in-transaction re-check (signature.findUnique with bon status) returns. */
function freshSigMock(bonStatus = 'sent_mise_dispo', overrides: Record<string, unknown> = {}) {
  return {
    signed: false,
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    bon: { status: bonStatus },
    ...overrides,
  };
}

/** Build a signature record matching what Prisma would return from findUnique with include. */
function buildSigWithBon(
  overrides: Record<string, unknown> = {},
  bonOverrides: Record<string, unknown> = {},
) {
  const bon = { ...sentMiseDispoBon(), ...bonOverrides };
  return {
    id: 'sig-test-001',
    bonId: bon.id,
    type: 'mise_disposition' as const,
    token: 'test-token-uuid',
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    signed: false,
    signatureImagePath: null as string | null,
    signedAt: null as Date | null,
    signerEmail: null as string | null,
    signerIp: null as string | null,
    signerUserAgent: null as string | null,
    mentionLuApprouve: false,
    isInPerson: false,
    initiatedById: 'user-tech-001',
    createdAt: new Date(),
    bon,
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('SignatureService', () => {
  let service: SignatureService;
  let prisma: MockPrisma;
  let encryption: ReturnType<typeof createMockEncryptionService>;
  let pdfService: ReturnType<typeof createMockPdfService>;
  let smbService: ReturnType<typeof createMockSmbService>;
  let bonsService: ReturnType<typeof createMockBonsService>;
  let moduleRefMock: ReturnType<typeof createMockModuleRef>;

  beforeEach(async () => {
    const rawPrisma = createMockPrismaService();
    prisma = rawPrisma as unknown as MockPrisma;
    encryption = createMockEncryptionService();
    pdfService = createMockPdfService();
    smbService = createMockSmbService();
    bonsService = createMockBonsService();
    moduleRefMock = createMockModuleRef(bonsService);
    // Défaut : le statut lu au moment du updateMany conditionnel (sign()) n'a
    // pas changé depuis freshSig → 1 ligne affectée. Les tests de concurrence
    // (statut modifié entre-temps) surchargent avec { count: 0 }.
    prisma.bon.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: AppConfigService, useValue: createMockConfigService() },
        { provide: TimestampService, useValue: createMockTimestampService() },
        { provide: PdfService, useValue: pdfService },
        { provide: SmbService, useValue: smbService },
        { provide: ModuleRef, useValue: moduleRefMock },
      ],
    }).compile();

    service = module.get<SignatureService>(SignatureService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── generateToken ───────────────────────────────────────────────────────

  describe('generateToken', () => {
    it('should create a new signature token', async () => {
      const createdSig = {
        id: 'sig-new-001',
        bonId: 'bon-001',
        type: 'mise_disposition',
        token: 'generated-uuid',
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        signed: false,
        isInPerson: false,
        initiatedById: 'user-001',
      };
      prisma.signature.updateMany.mockResolvedValue({ count: 0 });
      prisma.signature.create.mockResolvedValue(createdSig);

      const result = await service.generateToken('bon-001', 'mise_disposition', 'user-001');

      expect(prisma.signature.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.signature.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createArgs.data.bonId).toBe('bon-001');
      expect(createArgs.data.type).toBe('mise_disposition');
      expect(createArgs.data.isInPerson).toBe(false);
      expect(createArgs.data.initiatedById).toBe('user-001');
      expect(typeof createArgs.data.token).toBe('string');
      expect(result).toEqual(createdSig);
    });

    it('should invalidate previous unsigned tokens of same type', async () => {
      prisma.signature.updateMany.mockResolvedValue({ count: 2 });
      prisma.signature.create.mockResolvedValue({ id: 'sig-new' });

      await service.generateToken('bon-001', 'mise_disposition');

      expect(prisma.signature.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'bon-001', type: 'mise_disposition', signed: false },
        data: { tokenExpiresAt: new Date(0) },
      });
    });

    it('should set correct expiry date (7 days)', async () => {
      prisma.signature.updateMany.mockResolvedValue({ count: 0 });
      prisma.signature.create.mockResolvedValue({ id: 'sig-new' });

      const before = Date.now();
      await service.generateToken('bon-001', 'mise_disposition');
      const after = Date.now();

      const createArgs = prisma.signature.create.mock.calls[0][0] as { data: Record<string, unknown> };
      const expiresAt = createArgs.data.tokenExpiresAt as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
    });

    it('should set a 2h expiry for in-person tokens regardless of the configured validity', async () => {
      prisma.signature.updateMany.mockResolvedValue({ count: 0 });
      prisma.signature.create.mockResolvedValue({ id: 'sig-new' });

      const before = Date.now();
      await service.generateToken('bon-001', 'mise_disposition', 'user-001', true);
      const after = Date.now();

      const createArgs = prisma.signature.create.mock.calls[0][0] as { data: Record<string, unknown> };
      const expiresAt = createArgs.data.tokenExpiresAt as Date;
      const twoHoursMs = 2 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + twoHoursMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + twoHoursMs);
      // Bien en-deçà de la validité standard (7 jours) : pas de confusion possible
      expect(expiresAt.getTime()).toBeLessThan(before + 24 * 60 * 60 * 1000);
    });

    it.each([
      'mise_disposition' as const,
      'restitution' as const,
      'pv_cloture' as const,
    ])('should work for signature type: %s', async (type) => {
      prisma.signature.updateMany.mockResolvedValue({ count: 0 });
      prisma.signature.create.mockResolvedValue({ id: 'sig-new', type });

      await service.generateToken('bon-001', type, 'user-001', type === 'mise_disposition');

      const createArgs = prisma.signature.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createArgs.data.type).toBe(type);
    });
  });

  // ─── getBonInfoByToken ───────────────────────────────────────────────────

  describe('getBonInfoByToken', () => {
    it('should return pending status with bon payload for the intended signer', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL);

      expect(result.status).toBe('pending');
      expect(result.bon).toBeDefined();
      expect(result.signature).toBeDefined();
    });

    it('should NOT expose the bon to another authenticated user', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken('test-token-uuid', 'someone.else@groupelivio.fr');

      expect(result.status).toBe('unauthorized');
      expect(result.bon).toBeUndefined();
    });

    it('should not leak the signing token nor signerIp in the pending payload', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = (await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL)) as {
        signature?: Record<string, unknown>;
      };

      expect(result.signature).toBeDefined();
      expect(result.signature).not.toHaveProperty('token');
      expect(result.signature).not.toHaveProperty('signerIp');
    });

    it('should skip the email check for in-person signatures', async () => {
      const sig = buildSigWithBon({ isInPerson: true });
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken('test-token-uuid', 'technicien@groupelivio.fr');

      expect(result.status).toBe('pending');
      expect(result.bon).toBeDefined();
    });

    it('should return already_signed status (minimal payload) for signed token', async () => {
      const sig = buildSigWithBon({
        signed: true,
        signedAt: new Date(),
        signatureImagePath: 'some-file.enc',
      });
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL);

      expect(result.status).toBe('already_signed');
      expect(result.bon).toBeUndefined();
    });

    it('should include bonId in the already_signed payload (frontend "download document" link)', async () => {
      const sig = buildSigWithBon({ signed: true, signedAt: new Date() });
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = (await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL)) as {
        bonId?: string;
      };

      expect(result.bonId).toBe(sig.bon.id);
    });

    it('should return expired status (minimal payload) for expired token', async () => {
      const sig = buildSigWithBon({
        tokenExpiresAt: new Date(Date.now() - 1000),
      });
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL);

      expect(result.status).toBe('expired');
      expect(result.bon).toBeUndefined();
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.signature.findUnique.mockResolvedValue(null);

      await expect(service.getBonInfoByToken('invalid-token', SIGNER_EMAIL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should recognize the recipient by id even when the email no longer matches (AD address change)', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken(
        'test-token-uuid',
        'nouvelle.adresse@groupelivio.fr',
        sig.bon.collaborateurId,
      );

      expect(result.status).toBe('pending');
      expect(result.bon).toBeDefined();
    });

    it('should stay unauthorized when neither id nor email match', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      const result = await service.getBonInfoByToken(
        'test-token-uuid',
        'someone.else@groupelivio.fr',
        'user-someone-else-001',
      );

      expect(result.status).toBe('unauthorized');
    });

    it.each(['cancelled', 'contested'] as const)(
      'should return %s status (before signed/expired checks) for a %s bon',
      async (status) => {
        const sig = buildSigWithBon(
          { tokenExpiresAt: new Date(Date.now() - 1000) }, // also expired: cancelled/contested must win
          { status },
        );
        prisma.signature.findUnique.mockResolvedValue(sig);

        const result = await service.getBonInfoByToken('test-token-uuid', SIGNER_EMAIL);

        expect(result).toEqual({ status, reference: sig.bon.reference });
      },
    );
  });

  // ─── sign ────────────────────────────────────────────────────────────────

  describe('sign', () => {
    it('should sign a pending signature', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      // Inside transaction: re-check finds unsigned, token valid, bon signable
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock());
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true, signedAt: new Date() });

      const updatedBon = { ...sig.bon, status: 'active' };
      prisma.bon.findUniqueOrThrow.mockResolvedValue(updatedBon);
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.sign(
        'test-token-uuid',
        VALID_SIGNATURE_DATA_URL,
        true,
        SIGNER_EMAIL,
        SIGNER_IP,
        SIGNER_UA,
      );

      expect(result.signature).toBeDefined();
      expect(result.bon).toBeDefined();
      expect(prisma.signature.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should update bon status after signing', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock());
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);

      const bonUpdateArgs = prisma.bon.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(bonUpdateArgs.data.status).toBe('active');
    });

    it('should verify signer email matches collaborateur', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, 'wrong@email.com', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should skip email check for in-person signatures', async () => {
      const sig = buildSigWithBon({ isInPerson: true });
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock());
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      // Different email should NOT throw for in-person
      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, 'different@email.com', SIGNER_IP, SIGNER_UA),
      ).resolves.toBeDefined();
    });

    it('should throw if already signed', async () => {
      const sig = buildSigWithBon({ signed: true, signedAt: new Date() });
      prisma.signature.findUnique.mockResolvedValue(sig);

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if token expired', async () => {
      const sig = buildSigWithBon({ tokenExpiresAt: new Date(Date.now() - 60_000) });
      prisma.signature.findUnique.mockResolvedValue(sig);

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if mentionLuApprouve is false', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, false, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if signature format invalid', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValue(sig);

      await expect(
        service.sign('test-token-uuid', 'not-a-valid-data-url', true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent concurrent signing (race condition check)', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      // Inside transaction: re-check finds already signed (concurrent write)
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('sent_mise_dispo', { signed: true }));

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject signing when the bon was cancelled concurrently', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      // Inside transaction: bon switched to cancelled between read and commit
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('cancelled'));

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.signature.update).not.toHaveBeenCalled();
    });

    it('should reject signing when the token was invalidated concurrently', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      // Inside transaction: token invalidated (epoch) between read and commit
      prisma.signature.findUnique.mockResolvedValueOnce(
        freshSigMock('sent_mise_dispo', { tokenExpiresAt: new Date(0) }),
      );

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.signature.update).not.toHaveBeenCalled();
    });

    it('should recognize the signer by id when the email no longer matches (AD address change)', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock());
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      await expect(
        service.sign(
          'test-token-uuid',
          VALID_SIGNATURE_DATA_URL,
          true,
          'nouvelle.adresse@groupelivio.fr',
          SIGNER_IP,
          SIGNER_UA,
          sig.bon.collaborateurId,
        ),
      ).resolves.toBeDefined();
    });

    it('should reject with ConflictException when the bon status changed concurrently (optimistic lock)', async () => {
      const sig = buildSigWithBon();
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      // La re-lecture en transaction voit toujours sent_mise_dispo (pas cancelled/
      // contested/archived, donc pas rejeté plus tôt), mais une AUTRE transaction a
      // déjà fait bouger le statut avant notre updateMany conditionnel : count=0.
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('sent_mise_dispo'));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.updateMany.mockResolvedValue({ count: 0 });
      prisma.auditLog.create.mockResolvedValue({});

      const { unlink: mockUnlink } = jest.requireMock('fs/promises') as { unlink: jest.Mock };
      mockUnlink.mockClear();

      await expect(
        service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(ConflictException);
      // La transaction a échoué APRÈS l'écriture du .enc : pas d'auditLog (jamais
      // committé), et le fichier signature orphelin doit être nettoyé.
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalledTimes(1);
    });

    it('should trigger the PV clôture hook after a restitution signature that keeps the bon in partially_returned', async () => {
      const sig = buildSigWithBon({ type: 'restitution' }, { status: 'partially_returned' });
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('partially_returned'));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'partially_returned' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);

      expect(moduleRefMock.get).toHaveBeenCalledWith(BONS_SERVICE, { strict: false });
      expect(bonsService.emitPvClotureIfDue).toHaveBeenCalledWith(sig.bon.id);
      // Pas encore clôturé (partially_returned) : pas d'archivedAt à cette étape
      const statusUpdateArgs = prisma.bon.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(statusUpdateArgs.data.archivedAt).toBeUndefined();
    });

    it('should NOT trigger the PV clôture hook when a restitution signature fully closes the bon (archived)', async () => {
      const sig = buildSigWithBon({ type: 'restitution' }, { status: 'sent_restitution' });
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('sent_restitution'));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'archived' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);

      expect(bonsService.emitPvClotureIfDue).not.toHaveBeenCalled();
    });

    it('should set archivedAt when the transition lands on archived (restitution complète)', async () => {
      const sig = buildSigWithBon({ type: 'restitution' }, { status: 'sent_restitution' });
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('sent_restitution'));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'archived' });
      prisma.auditLog.create.mockResolvedValue({});

      const before = Date.now();
      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);
      const after = Date.now();

      const statusUpdateArgs = prisma.bon.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(statusUpdateArgs.data.status).toBe('archived');
      const archivedAt = statusUpdateArgs.data.archivedAt as Date;
      expect(archivedAt).toBeInstanceOf(Date);
      expect(archivedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(archivedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should set archivedAt when a PV clôture signature archives the bon', async () => {
      const sig = buildSigWithBon({ type: 'pv_cloture' }, { status: 'partially_returned' });
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock('partially_returned'));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...sig.bon, status: 'archived' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);

      const statusUpdateArgs = prisma.bon.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(statusUpdateArgs.data.archivedAt).toBeInstanceOf(Date);
    });
  });

  // ─── signItCachet ────────────────────────────────────────────────────────

  describe('signItCachet', () => {
    it('should create IT cachet signature', async () => {
      const bon = activeBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValueOnce(bon);
      prisma.signature.updateMany.mockResolvedValue({ count: 0 });
      prisma.signature.create.mockResolvedValue({
        id: 'sig-it-new',
        bonId: bon.id,
        type: 'it_cachet',
        signed: true,
      });
      prisma.auditLog.create.mockResolvedValue({});
      prisma.bon.findUniqueOrThrow.mockResolvedValueOnce(bon);

      const result = await service.signItCachet(
        bon.id,
        VALID_SIGNATURE_DATA_URL,
        'marie.martin@groupelivio.fr',
        SIGNER_IP,
        SIGNER_UA,
      );

      expect(result.ok).toBe(true);
      expect(result.bon).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(prisma.signature.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('should handle idempotency (return existing if recent)', async () => {
      const bon = activeBon();
      const recentSig = {
        id: 'sig-it-recent',
        bonId: bon.id,
        type: 'it_cachet',
        signed: true,
        signedAt: new Date(),
      };
      prisma.signature.findFirst.mockResolvedValue(recentSig);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      const result = await service.signItCachet(
        bon.id,
        VALID_SIGNATURE_DATA_URL,
        'marie.martin@groupelivio.fr',
        SIGNER_IP,
        SIGNER_UA,
      );

      expect(result.ok).toBe(true);
      // Response is sanitized to API-safe fields (no token/imagePath)
      expect(result.signature).toMatchObject({
        id: 'sig-it-recent',
        type: 'it_cachet',
        signed: true,
      });
      // Should NOT create a new signature
      expect(prisma.signature.create).not.toHaveBeenCalled();
    });

    it('should throw for draft bons (le cachet IT requiert un bon envoyé)', async () => {
      const bon = draftBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await expect(
        service.signItCachet(bon.id, VALID_SIGNATURE_DATA_URL, 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.signItCachet(bon.id, VALID_SIGNATURE_DATA_URL, 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow('Le cachet IT ne peut être apposé que sur un bon envoyé');
    });

    it('should throw for cancelled bons', async () => {
      const bon = cancelledBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await expect(
        service.signItCachet(bon.id, VALID_SIGNATURE_DATA_URL, 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for archived bons', async () => {
      const bon = archivedBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await expect(
        service.signItCachet(bon.id, VALID_SIGNATURE_DATA_URL, 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for contested bons', async () => {
      const bon = contestedBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await expect(
        service.signItCachet(bon.id, VALID_SIGNATURE_DATA_URL, 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid signature format', async () => {
      const bon = activeBon();
      prisma.signature.findFirst.mockResolvedValue(null);
      prisma.bon.findUniqueOrThrow.mockResolvedValue(bon);

      await expect(
        service.signItCachet(bon.id, 'not-base64-png', 'tech@test.fr', SIGNER_IP, SIGNER_UA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getNextBonStatus (tested through sign()) ────────────────────────────

  describe('getNextBonStatus', () => {
    // Helper: sets up mocks for a successful sign flow and returns the new status
    async function signAndGetStatusUpdate(
      bonStatus: string,
      sigType: 'mise_disposition' | 'restitution' | 'pv_cloture',
    ): Promise<string> {
      const bon = {
        ...sentMiseDispoBon(),
        status: bonStatus,
        signatures: [],
      };
      const sig = buildSigWithBon(
        { type: sigType },
        { status: bonStatus, signatures: [] },
      );
      prisma.signature.findUnique.mockResolvedValueOnce(sig);
      prisma.signature.findUnique.mockResolvedValueOnce(freshSigMock(bonStatus));
      prisma.signature.update.mockResolvedValue({ ...sig, signed: true });
      prisma.bon.findUniqueOrThrow.mockResolvedValue({ ...bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign(
        'test-token-uuid',
        VALID_SIGNATURE_DATA_URL,
        true,
        SIGNER_EMAIL,
        SIGNER_IP,
        SIGNER_UA,
      );

      const bonUpdateArgs = prisma.bon.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
      return bonUpdateArgs.data.status as string;
    }

    it('should transition sent_mise_dispo to active for mise_disposition', async () => {
      const newStatus = await signAndGetStatusUpdate('sent_mise_dispo', 'mise_disposition');
      expect(newStatus).toBe('active');
    });

    it('should transition sent_restitution to archived for restitution', async () => {
      const newStatus = await signAndGetStatusUpdate('sent_restitution', 'restitution');
      expect(newStatus).toBe('archived');
    });

    it('should keep partially_returned for restitution (partial — equipment still pending)', async () => {
      const newStatus = await signAndGetStatusUpdate('partially_returned', 'restitution');
      expect(newStatus).toBe('partially_returned');
    });

    it('should transition partially_returned to archived for pv_cloture', async () => {
      const newStatus = await signAndGetStatusUpdate('partially_returned', 'pv_cloture');
      expect(newStatus).toBe('archived');
    });

    it('should keep current status for invalid transition', async () => {
      // active + mise_disposition is not a valid transition
      const newStatus = await signAndGetStatusUpdate('active', 'mise_disposition');
      expect(newStatus).toBe('active');
    });
  });

  // ─── invalidateUnsignedTokens ────────────────────────────────────────────

  describe('invalidateUnsignedTokens', () => {
    it('should set tokenExpiresAt to epoch for all unsigned tokens', async () => {
      prisma.signature.updateMany.mockResolvedValue({ count: 3 });

      await service.invalidateUnsignedTokens('bon-001');

      expect(prisma.signature.updateMany).toHaveBeenCalledWith({
        where: {
          bonId: 'bon-001',
          signed: false,
          tokenExpiresAt: { gt: new Date(1000) },
        },
        data: { tokenExpiresAt: new Date(0) },
      });
    });
  });

  // ─── getSignatureImagesForBon ────────────────────────────────────────────

  describe('getSignatureImagesForBon', () => {
    const { readFile: mockReadFile } = jest.requireMock('fs/promises') as { readFile: jest.Mock };

    it('should build SigImages from signed signatures', async () => {
      mockReadFile.mockResolvedValue('encrypted:base64ItData');

      const signatures = [
        {
          type: 'it_cachet',
          signed: true,
          signedAt: new Date(),
          signatureImagePath: 'it_cachet.enc',
        },
        {
          type: 'mise_disposition',
          signed: true,
          signedAt: new Date(),
          signatureImagePath: 'mise_dispo.enc',
        },
      ];

      const result = await service.getSignatureImagesForBon(signatures);

      expect(result.it).toBeDefined();
      expect(result.collab).toBeDefined();
    });

    it('should return null for unsigned signatures', async () => {
      const signatures = [
        {
          type: 'it_cachet',
          signed: false,
          signedAt: null,
          signatureImagePath: null,
        },
        {
          type: 'mise_disposition',
          signed: false,
          signedAt: null,
          signatureImagePath: null,
        },
      ];

      const result = await service.getSignatureImagesForBon(signatures);

      expect(result.it).toBeNull();
      expect(result.collab).toBeNull();
    });
  });

  // ─── verifyBonIntegrity ──────────────────────────────────────────────────

  describe('verifyBonIntegrity', () => {
    it('should mark an anonymized bon as non-verifiable without failing allValid', async () => {
      prisma.bon.findUnique.mockResolvedValue({ anonymizedAt: new Date('2026-05-01') });
      prisma.signature.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          bonId: 'bon-anon-001',
          type: 'mise_disposition',
          signed: true,
          signedAt: new Date('2026-01-01'),
          signerEmail: null, // effacé par l'anonymisation
          mentionLuApprouve: true,
          isInPerson: false,
          signedByProxy: false,
          seal: 'seal:some-payload',
          tsToken: null,
          tsAuthority: null,
        },
      ]);

      const result = await service.verifyBonIntegrity('bon-anon-001');

      expect(result.anonymized).toBe(true);
      expect(result.allValid).toBe(true);
      expect(result.signatures).toHaveLength(1);
      expect(result.signatures[0].sealValid).toBeNull();
      // Le sceau n'est jamais recalculé pour un bon anonymisé (PII effacée)
      expect(encryption.verifySeal).not.toHaveBeenCalled();
    });

    it('should compute sealValid normally for a non-anonymized bon', async () => {
      prisma.bon.findUnique.mockResolvedValue({ anonymizedAt: null });
      const signedAt = new Date('2026-01-01');
      prisma.signature.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          bonId: 'bon-001',
          type: 'mise_disposition',
          signed: true,
          signedAt,
          signerEmail: SIGNER_EMAIL,
          mentionLuApprouve: true,
          isInPerson: false,
          signedByProxy: false,
          seal: 'seal:valid',
          tsToken: null,
          tsAuthority: null,
        },
      ]);
      encryption.verifySeal.mockReturnValue(true);

      const result = await service.verifyBonIntegrity('bon-001');

      expect(result.anonymized).toBe(false);
      expect(result.allValid).toBe(true);
      expect(result.signatures[0].sealValid).toBe(true);
      expect(encryption.verifySeal).toHaveBeenCalled();
    });
  });
});
