import { BadRequestException } from '@nestjs/common';
import { RetentionService } from '../retention.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false) }));
jest.mock('fs/promises', () => ({ unlink: jest.fn().mockResolvedValue(undefined) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (fn: unknown): jest.Mock => fn as any;

describe('RetentionService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: ReturnType<typeof createMockConfigService>;
  let attachments: { purgeForBon: jest.Mock };
  let service: RetentionService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    config = createMockConfigService();
    attachments = { purgeForBon: jest.fn().mockResolvedValue(2) };
    service = new RetentionService(prisma as never, config as never, attachments as never);

    // Modèles utilisés par anonymizeBon / purgeOldAttachments non présents (ou
    // sans défaut) dans le mock Prisma partagé — complétés ici localement.
    (prisma.auditLog as unknown as { findMany: jest.Mock }).findMany = jest.fn().mockResolvedValue([]);
    (prisma.auditLog as unknown as { update: jest.Mock }).update = jest.fn().mockResolvedValue({});
    (prisma.auditLog as unknown as { updateMany: jest.Mock }).updateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    (prisma.notificationLog as unknown as { updateMany: jest.Mock }).updateMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    (prisma.signature as unknown as { deleteMany: jest.Mock }).deleteMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    (prisma.signature as unknown as { count: jest.Mock }).count = jest.fn().mockResolvedValue(0);

    asMock(prisma.bon.findUnique).mockResolvedValue({
      collaborateurId: 'collab-1',
      collaborateurEmail: 'jean.dupont@test.fr',
    });
    asMock(prisma.user.upsert).mockResolvedValue({ id: 'user-anon-1', email: 'anonymise@rgpd.local' });
    asMock(prisma.signature.findMany).mockResolvedValue([]);
    asMock(prisma.attachment.findMany).mockResolvedValue([]);
    asMock(prisma.attachment.count).mockResolvedValue(0);
    asMock(prisma.bon.count).mockResolvedValue(0);
    asMock(prisma.bon.findMany).mockResolvedValue([]);
  });

  describe('preview', () => {
    it('counts eligible bons and old attachments without modifying anything', async () => {
      asMock(prisma.bon.count).mockResolvedValue(5);
      asMock(prisma.attachment.count).mockResolvedValue(3);

      const r = await service.preview();

      expect(r.eligible).toBe(5);
      expect(r.oldAttachmentsPurged).toBe(3);
      expect(r.dryRun).toBe(true);
      expect(prisma.bon.update).not.toHaveBeenCalled();
    });
  });

  describe('run — dry run', () => {
    it('does not anonymize or purge anything', async () => {
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      asMock(prisma.attachment.count).mockResolvedValue(4);

      const r = await service.run(true);

      expect(r.anonymized).toBe(0);
      expect(r.oldAttachmentsPurged).toBe(4);
      expect(prisma.bon.update).not.toHaveBeenCalled();
      expect(attachments.purgeForBon).not.toHaveBeenCalled();
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
    });

    it('records the dry-run timestamp (system.retention_last_dry_run)', async () => {
      await service.run(true);
      expect(config.set).toHaveBeenCalledWith(
        'system',
        'retention_last_dry_run',
        expect.any(String),
      );
    });
  });

  describe('run — garde-fou dry-run < 24h (déclenchement manuel)', () => {
    it('refuses a real run when no dry-run was ever recorded', async () => {
      await expect(service.run(false)).rejects.toThrow(BadRequestException);
      expect(prisma.bon.findMany).not.toHaveBeenCalled();
    });

    it('refuses a real run when the last dry-run is older than 24h', async () => {
      await config.set('system', 'retention_last_dry_run', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());
      await expect(service.run(false)).rejects.toThrow(BadRequestException);
    });

    it('allows a real run right after a dry-run', async () => {
      asMock(prisma.bon.findMany).mockResolvedValue([]);
      await service.run(true);
      await expect(service.run(false)).resolves.toBeDefined();
    });

    it('does not require a prior dry-run for a cron-triggered run', async () => {
      asMock(prisma.bon.findMany).mockResolvedValue([]);
      await expect(service.run(false, undefined, 'cron')).resolves.toBeDefined();
    });
  });

  describe('run — anonymization', () => {
    async function primeDryRun() {
      await service.run(true);
    }

    it('anonymizes eligible bons: PII, attachments, proofs, and reassigns collaborateurId', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);

      const r = await service.run(false, 'admin@test.fr');

      expect(r.anonymized).toBe(1);
      expect(r.attachmentsPurged).toBe(2);
      expect(attachments.purgeForBon).toHaveBeenCalledWith('b1');

      expect(prisma.signature.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1' },
        data: expect.objectContaining({
          signerEmail: null,
          signerIp: null,
          signerUserAgent: null,
          signatureImagePath: null,
          seal: null,
          sealedAt: null,
          tsToken: null,
        }),
      });
      expect(prisma.pdfSnapshot.deleteMany).toHaveBeenCalledWith({ where: { bonId: 'b1' } });
      expect(prisma.proofArchive.deleteMany).toHaveBeenCalledWith({ where: { bonId: 'b1' } });
      expect(prisma.notificationLog.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1' },
        data: { recipientEmail: 'anonymise@rgpd.local' },
      });
      expect(prisma.contestation.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1' },
        data: { message: '[anonymisé]' },
      });
      // FK userId réassignée vers le compte technique (pas seulement le texte) :
      // Contestation/AuditLog chargés avec `include: user` ailleurs réexposeraient
      // sinon le nom réel malgré l'anonymisation des colonnes texte.
      expect(prisma.contestation.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1', userId: 'collab-1' },
        data: { userId: 'user-anon-1' },
      });
      expect(prisma.auditLog.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1', userId: 'collab-1' },
        data: { userId: 'user-anon-1' },
      });
      expect(prisma.smbExport.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1' },
        data: { filename: 'anonymise.pdf' },
      });
      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({
            collaborateurId: 'user-anon-1',
            collaborateurEmail: 'anonymise@rgpd.local',
            anonymizedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('upserts the technical "anonymisé" user (idempotent — no race between two runs)', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);

      await service.run(false);

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { email: 'anonymise@rgpd.local' },
        update: {},
        create: {
          email: 'anonymise@rgpd.local',
          samAccountName: 'anonymise_rgpd',
          displayName: 'Collaborateur anonymisé',
          role: 'collaborator',
          isLocalAccount: true,
          active: false,
          passwordHash: null,
        },
      });
    });

    it('reuses the existing technical user id (upsert on an already-existing account)', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      asMock(prisma.user.upsert).mockResolvedValue({ id: 'existing-anon', email: 'anonymise@rgpd.local' });

      await service.run(false);

      expect(prisma.bon.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ collaborateurId: 'existing-anon' }) }),
      );
    });

    it('reassigns the contestation.userId and auditLog.userId FKs from the old collaborateur to the technical user', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      asMock(prisma.bon.findUnique).mockResolvedValue({
        collaborateurId: 'collab-42',
        collaborateurEmail: 'jean.dupont@test.fr',
      });
      asMock(prisma.user.upsert).mockResolvedValue({ id: 'user-anon-9', email: 'anonymise@rgpd.local' });

      await service.run(false);

      expect(prisma.contestation.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1', userId: 'collab-42' },
        data: { userId: 'user-anon-9' },
      });
      expect(prisma.auditLog.updateMany).toHaveBeenCalledWith({
        where: { bonId: 'b1', userId: 'collab-42' },
        data: { userId: 'user-anon-9' },
      });
    });

    it('anonymizes audit log entries matching the old collaborateur email, strips PII keys, and always clears ip/userAgent', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      asMock(prisma.bon.findUnique).mockResolvedValue({ collaborateurEmail: 'Jean.Dupont@Test.fr' });
      asMock(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log-1',
          userEmail: 'jean.dupont@test.fr', // casse différente → doit matcher
          details: { filename: 'photo.png', signerEmail: 'jean.dupont@test.fr', other: 'keep-me' },
        },
        {
          id: 'log-2',
          userEmail: 'technicien@test.fr', // pas le collaborateur → email conservé
          details: { titulaireEmail: 'jean.dupont@test.fr' },
        },
      ]);

      await service.run(false);

      expect(prisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: {
          userEmail: 'anonymise@rgpd.local',
          ipAddress: null,
          userAgent: null,
          details: { other: 'keep-me' },
        },
      });
      expect(prisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-2' },
        data: {
          userEmail: 'technicien@test.fr',
          ipAddress: null,
          userAgent: null,
          details: {},
        },
      });
    });

    it('strips the message (bon_contested) and reason (declare_not_returned / bon_closed_unilateral) keys too', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);
      asMock(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log-contested',
          userEmail: null,
          details: { message: 'Le matériel reçu ne correspond pas...', previousStatus: 'active' },
        },
        {
          id: 'log-not-returned',
          userEmail: null,
          details: { reason: 'Perdu par le collaborateur lors du déménagement' },
        },
      ]);

      await service.run(false);

      expect(prisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-contested' },
        data: expect.objectContaining({ details: { previousStatus: 'active' } }),
      });
      expect(prisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-not-returned' },
        data: expect.objectContaining({ details: {} }),
      });
    });

    it('writes a bon_anonymized audit entry with the triggering user', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);

      await service.run(false, 'admin@test.fr');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          bonId: 'b1',
          userEmail: 'admin@test.fr',
          action: 'bon_anonymized',
          details: { reason: 'retention_rgpd' },
        },
      });
    });

    it('writes a single retention_run summary audit', async () => {
      await primeDryRun();
      asMock(prisma.bon.findMany).mockResolvedValue([{ id: 'b1', reference: 'R1' }]);

      await service.run(false, 'admin@test.fr', 'manual');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userEmail: 'admin@test.fr',
          action: 'retention_run',
          details: expect.objectContaining({
            trigger: 'manual',
            anonymized: 1,
            dryRun: false,
          }),
        },
      });
    });
  });

  describe('anonymize_months — plancher légal (60 mois)', () => {
    it('raises a below-floor configured value to 60 months', async () => {
      asMock(config.get).mockImplementation((cat: string, key: string) =>
        Promise.resolve(key === 'anonymize_months' ? '3' : null),
      );
      asMock(prisma.bon.count).mockResolvedValue(0);

      const r = await service.preview();

      const cutoffMonthsAgo =
        (Date.now() - new Date(r.cutoff).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
      // ~60 mois (≈5 ans), certainement pas ~3 mois
      expect(cutoffMonthsAgo).toBeGreaterThan(50);
    });
  });

  describe('purgeOldAttachments', () => {
    it('deletes matching attachments (file + row) and returns the count', async () => {
      asMock(prisma.attachment.findMany).mockResolvedValue([
        { id: 'att-1', storedPath: 'file1.enc' },
        { id: 'att-2', storedPath: 'file2.enc' },
      ]);

      const count = await service.purgeOldAttachments(new Date());

      expect(count).toBe(2);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-2' } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: { action: 'attachments_purged', details: { count: 2 } },
      });
    });

    it('ignores missing files (ENOENT) but still deletes the row', async () => {
      const fsPromises = jest.requireMock('fs/promises') as { unlink: jest.Mock };
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      fsPromises.unlink.mockRejectedValueOnce(enoent);
      asMock(prisma.attachment.findMany).mockResolvedValue([{ id: 'att-1', storedPath: 'gone.enc' }]);

      const count = await service.purgeOldAttachments(new Date());

      expect(count).toBe(1);
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });
  });

  describe('getRetentionStats', () => {
    it('includes the attachment retention config and purgeable count', async () => {
      asMock(config.get).mockImplementation((cat: string, key: string) =>
        Promise.resolve(key === 'attachment_months' ? '18' : null),
      );
      asMock(prisma.attachment.count).mockResolvedValue(7);

      const stats = await service.getRetentionStats();

      expect(stats.config.attachmentMonths).toBe(18);
      expect(stats.purgeable.oldAttachments).toBe(7);
    });
  });
});
