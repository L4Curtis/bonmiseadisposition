import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { collaboratorUser, manualAccountUser } from '../../common/__tests__/fixtures/user.fixtures';
import { CreateManualUserDto, UpdateManualUserDto } from '../dto/manual-user.dto';

const ACTOR_ID = 'actor-001';

describe('UsersService — manual accounts', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  // ─── createManual ────────────────────────────────────────────────────────

  describe('createManual', () => {
    const minimalDto: CreateManualUserDto = { firstName: 'Jean', lastName: 'Dupont' };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(null); // email available
      prisma.user.findUnique.mockResolvedValue(null); // samAccountName free
    });

    it('creates a manual, non-authenticatable collaborator (nominal)', async () => {
      prisma.user.create.mockResolvedValue({ ...manualAccountUser() });

      const result = await service.createManual(minimalDto, ACTOR_ID);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          samAccountName: 'manuel.jean.dupont',
          displayName: 'Jean DUPONT',
          email: null,
          department: null,
          filialeId: null,
          role: 'collaborator',
          isItStaff: false,
          active: true,
          isManualAccount: true,
          isLocalAccount: false,
          passwordHash: null,
          lastLdapSync: null,
        },
        select: expect.any(Object),
      });
      expect(result.isManualAccount).toBe(true);
    });

    it('writes a user_created_manually audit entry', async () => {
      const created = { ...manualAccountUser() };
      prisma.user.create.mockResolvedValue(created);

      await service.createManual(minimalDto, ACTOR_ID);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: ACTOR_ID,
          action: 'user_created_manually',
          details: {
            targetUserId: created.id,
            samAccountName: created.samAccountName,
            displayName: created.displayName,
          },
        },
      });
    });

    it('treats a blank email ("") the same as an absent email', async () => {
      prisma.user.create.mockResolvedValue({ ...manualAccountUser() });

      await service.createManual({ ...minimalDto, email: '' }, ACTOR_ID);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: null }) }),
      );
      // No uniqueness check should run for a null email
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('normalizes and lower-cases a provided email', async () => {
      prisma.user.create.mockResolvedValue({ ...manualAccountUser() });

      await service.createManual({ ...minimalDto, email: '  Jean.Dupont@Exemple.FR  ' }, ACTOR_ID);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'jean.dupont@exemple.fr' }) }),
      );
    });

    it('rejects an email already used, case-insensitively', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.createManual({ ...minimalDto, email: 'Jean.Dupont@Exemple.fr' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown filialeId', async () => {
      prisma.filiale.findUnique.mockResolvedValue(null);

      await expect(
        service.createManual({ ...minimalDto, filialeId: '11111111-1111-1111-1111-111111111111' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive filiale', async () => {
      prisma.filiale.findUnique.mockResolvedValue({ id: 'filiale-1', active: false });

      await expect(
        service.createManual({ ...minimalDto, filialeId: '11111111-1111-1111-1111-111111111111' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('accepts an active filiale', async () => {
      prisma.filiale.findUnique.mockResolvedValue({ id: 'filiale-1', active: true });
      prisma.user.create.mockResolvedValue({ ...manualAccountUser(), filialeId: 'filiale-1' });

      await service.createManual({ ...minimalDto, filialeId: '11111111-1111-1111-1111-111111111111' }, ACTOR_ID);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ filialeId: '11111111-1111-1111-1111-111111111111' }) }),
      );
    });

    it('suffixes the samAccountName on a single collision', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'someone-else' }) // base taken
        .mockResolvedValueOnce(null); // -2 free
      prisma.user.create.mockResolvedValue({ ...manualAccountUser(), samAccountName: 'manuel.jean.dupont-2' });

      await service.createManual(minimalDto, ACTOR_ID);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ samAccountName: 'manuel.jean.dupont-2' }) }),
      );
    });

    it('translates a residual P2002 (race condition) into a BadRequestException', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.createManual(minimalDto, ACTOR_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateManual ────────────────────────────────────────────────────────

  describe('updateManual', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateManual('missing-id', {}, ACTOR_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects modifying a directory (non-manual) account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...collaboratorUser() });

      await expect(
        service.updateManual(collaboratorUser().id, { department: 'IT' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates allowed fields on a manual account and writes an audit entry with the changed fields', async () => {
      const existing = manualAccountUser();
      prisma.user.findUnique.mockResolvedValue({ ...existing });
      prisma.user.update.mockResolvedValue({ ...existing, department: 'Chantier Nord', active: false });

      const dto: UpdateManualUserDto = { department: 'Chantier Nord', active: false };
      await service.updateManual(existing.id, dto, ACTOR_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { department: 'Chantier Nord', active: false },
        select: expect.any(Object),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: ACTOR_ID,
          action: 'user_updated_manually',
          details: { targetUserId: existing.id, changedFields: ['department', 'active'] },
        },
      });
    });

    it('recomputes displayName when only firstName is provided', async () => {
      const existing = { ...manualAccountUser(), displayName: 'Jean DUPONT' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, displayName: 'Jules DUPONT' });

      await service.updateManual(existing.id, { firstName: 'Jules' }, ACTOR_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: 'Jules DUPONT' }) }),
      );
    });

    it('recomputes displayName when only lastName is provided', async () => {
      const existing = { ...manualAccountUser(), displayName: 'Jean DUPONT' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, displayName: 'Jean MARTIN' });

      await service.updateManual(existing.id, { lastName: 'Martin' }, ACTOR_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: 'Jean MARTIN' }) }),
      );
    });

    it('clears the email when given an empty string', async () => {
      const existing = { ...manualAccountUser(), email: 'jean.dupont@exemple.fr' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue({ ...existing, email: null });

      await service.updateManual(existing.id, { email: '' }, ACTOR_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: null }) }),
      );
      // Clearing an email never needs a uniqueness check
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a new email already used by another account (excluding itself)', async () => {
      const existing = manualAccountUser();
      prisma.user.findUnique.mockResolvedValue({ ...existing });
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.updateManual(existing.id, { email: 'taken@exemple.fr' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'taken@exemple.fr', mode: 'insensitive' }, id: { not: existing.id } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown or inactive filialeId', async () => {
      const existing = manualAccountUser();
      prisma.user.findUnique.mockResolvedValue({ ...existing });
      prisma.filiale.findUnique.mockResolvedValue(null);

      await expect(
        service.updateManual(existing.id, { filialeId: '11111111-1111-1111-1111-111111111111' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('is a no-op (no audit, no write) when no field actually changes', async () => {
      const existing = manualAccountUser();
      prisma.user.findUnique.mockResolvedValue({ ...existing });

      await service.updateManual(existing.id, {}, ACTOR_ID);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
