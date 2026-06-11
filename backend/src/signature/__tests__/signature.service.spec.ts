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
} from '@nestjs/common';
import { SignatureService } from '../signature.service';
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
} from '../../common/__tests__/helpers/mock-services';
import {
  sentMiseDispoBon,
  activeBon,
  cancelledBon,
  contestedBon,
  archivedBon,
} from '../../common/__tests__/fixtures/bon.fixtures';

// ─── Mock fs module ──────────────────────────────────────────────────────────

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('encrypted:base64data'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
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

  beforeEach(async () => {
    const rawPrisma = createMockPrismaService();
    prisma = rawPrisma as unknown as MockPrisma;
    encryption = createMockEncryptionService();
    pdfService = createMockPdfService();
    smbService = createMockSmbService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: AppConfigService, useValue: createMockConfigService() },
        { provide: PdfService, useValue: pdfService },
        { provide: SmbService, useValue: smbService },
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
      prisma.bon.update.mockResolvedValue(updatedBon);
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
      prisma.bon.update.mockResolvedValue({ ...sig.bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign('test-token-uuid', VALID_SIGNATURE_DATA_URL, true, SIGNER_EMAIL, SIGNER_IP, SIGNER_UA);

      const bonUpdateArgs = prisma.bon.update.mock.calls[0][0] as { data: Record<string, unknown> };
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
      prisma.bon.update.mockResolvedValue({ ...sig.bon, status: 'active' });
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
      prisma.bon.update.mockResolvedValue({ ...bon, status: 'active' });
      prisma.auditLog.create.mockResolvedValue({});

      await service.sign(
        'test-token-uuid',
        VALID_SIGNATURE_DATA_URL,
        true,
        SIGNER_EMAIL,
        SIGNER_IP,
        SIGNER_UA,
      );

      const bonUpdateArgs = prisma.bon.update.mock.calls[0][0] as { data: Record<string, unknown> };
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
});
