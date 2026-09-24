import { ForbiddenException } from '@nestjs/common';
import { AttachmentsController } from '../attachments.controller';
import { AttachmentsService } from '../attachments.service';
import { AuthUser } from '../../auth/auth-user.interface';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

/**
 * Point 8 : un collaborateur ne peut ajouter/supprimer des pièces jointes que
 * pendant la « période de signature » (bon envoyé / en attente de
 * restitution). Admin/technician ne sont jamais restreints.
 */
describe('AttachmentsController — collaborator write window', () => {
  let controller: AttachmentsController;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let attachments: {
    list: Mock;
    create: Mock;
    remove: Mock;
  };

  const collaborator: AuthUser = {
    id: 'collab-1',
    samAccountName: 'jdupont',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@livio.fr',
    department: null,
    company: null,
    title: null,
    filialeId: null,
    filiale: null,
    isItStaff: false,
    role: 'collaborator',
    isLocalAccount: false,
    mustChangePassword: false,
    active: true,
  };

  const technician: AuthUser = { ...collaborator, id: 'tech-1', role: 'technician' };

  const uploadedFile = {
    buffer: Buffer.from('data'),
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: 4,
  } as Express.Multer.File;

  beforeEach(() => {
    prisma = createMockPrismaService();
    attachments = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'att-1' }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    };
    controller = new AttachmentsController(attachments as unknown as AttachmentsService, prisma as never);
  });

  const mockBon = (overrides: Partial<{ collaborateurId: string; status: string }> = {}) => {
    (prisma.bon.findUnique as Mock).mockImplementation(({ select }: { select: Record<string, boolean> }) => {
      if (select.collaborateurId) return Promise.resolve({ collaborateurId: overrides.collaborateurId ?? collaborator.id });
      if (select.status) return Promise.resolve({ status: overrides.status ?? 'sent_mise_dispo' });
      return Promise.resolve(null);
    });
  };

  describe('upload', () => {
    it('allows a collaborator to upload while the bon is in the signing window', async () => {
      mockBon({ status: 'sent_mise_dispo' });

      await expect(
        controller.upload('bon-1', uploadedFile, 'mise_disposition', undefined, collaborator),
      ).resolves.toBeDefined();
      expect(attachments.create).toHaveBeenCalled();
    });

    it('forbids a collaborator from uploading once the bon is archived', async () => {
      mockBon({ status: 'archived' });

      await expect(
        controller.upload('bon-1', uploadedFile, 'mise_disposition', undefined, collaborator),
      ).rejects.toThrow(ForbiddenException);
      expect(attachments.create).not.toHaveBeenCalled();
    });

    it('never restricts admin/technician regardless of bon status', async () => {
      mockBon({ status: 'archived' });

      await expect(
        controller.upload('bon-1', uploadedFile, 'mise_disposition', undefined, technician),
      ).resolves.toBeDefined();
      expect(attachments.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('forbids a collaborator from deleting once the bon is archived', async () => {
      mockBon({ status: 'archived' });

      await expect(controller.remove('bon-1', 'att-1', collaborator)).rejects.toThrow(ForbiddenException);
      expect(attachments.remove).not.toHaveBeenCalled();
    });

    it('allows a collaborator to delete their own attachment during the signing window', async () => {
      mockBon({ status: 'sent_mise_dispo' });
      attachments.list.mockResolvedValue([
        { id: 'att-1', uploadedByEmail: collaborator.email },
      ]);

      await expect(controller.remove('bon-1', 'att-1', collaborator)).resolves.toEqual({ ok: true });
      expect(attachments.remove).toHaveBeenCalled();
    });

    it("forbids a collaborator from deleting another user's attachment when author info is known", async () => {
      mockBon({ status: 'sent_mise_dispo' });
      attachments.list.mockResolvedValue([
        { id: 'att-1', uploadedByEmail: 'someone.else@livio.fr' },
      ]);

      await expect(controller.remove('bon-1', 'att-1', collaborator)).rejects.toThrow(ForbiddenException);
      expect(attachments.remove).not.toHaveBeenCalled();
    });

    it('falls back to the status window only when author info is missing', async () => {
      mockBon({ status: 'sent_mise_dispo' });
      attachments.list.mockResolvedValue([{ id: 'att-1', uploadedByEmail: null }]);

      await expect(controller.remove('bon-1', 'att-1', collaborator)).resolves.toEqual({ ok: true });
    });

    it('never restricts admin/technician regardless of bon status or authorship', async () => {
      mockBon({ status: 'archived' });

      await expect(controller.remove('bon-1', 'att-1', technician)).resolves.toEqual({ ok: true });
      expect(attachments.remove).toHaveBeenCalled();
    });
  });
});
