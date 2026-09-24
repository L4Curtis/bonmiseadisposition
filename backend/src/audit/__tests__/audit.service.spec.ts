import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { AUDIT_EXPORT_MAX_ROWS } from '../audit-csv';

function log(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    bonId: null,
    userId: 'u1',
    userEmail: null,
    action: 'bon_created',
    details: null,
    ipAddress: '10.0.0.1',
    userAgent: 'Firefox',
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    bon: null,
    user: { id: 'u1', displayName: 'Admin', email: 'admin@livio.fr' },
    ...overrides,
  };
}

describe('AuditService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: AuditService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    service = new AuditService(prisma as unknown as PrismaService);
  });

  describe('findAll — filtres', () => {
    it("filtre par auteur sur le nom ET l'email, y compris les entrées tracées par email seul", async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ email: 'jean@livio.fr' }]);
      await service.findAll({ user: ' Jean ' });

      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      const contains = { contains: 'Jean', mode: 'insensitive' };
      expect(where.OR).toEqual([
        { userEmail: contains },
        { user: { email: contains } },
        { user: { displayName: contains } },
        { userEmail: { in: ['jean@livio.fr'], mode: 'insensitive' } },
      ]);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { displayName: contains, email: { not: null } },
      }));
    });

    it("accepte encore l'ancien paramètre userEmail", async () => {
      await service.findAll({ userEmail: 'admin@' });
      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      expect(where.OR[0]).toEqual({ userEmail: { contains: 'admin@', mode: 'insensitive' } });
    });

    it('combine action et période (jours civils de Paris)', async () => {
      await service.findAll({ action: 'login', dateFrom: '2026-09-01', dateTo: '2026-09-24' });
      const { where } = prisma.auditLog.findMany.mock.calls[0][0];
      expect(where).toEqual({
        action: { contains: 'login', mode: 'insensitive' },
        createdAt: { gte: new Date('2026-08-31T22:00:00.000Z'), lt: new Date('2026-09-24T22:00:00.000Z') },
      });
      expect(prisma.auditLog.count).toHaveBeenCalledWith({ where });
    });

    it('rejette une date invalide', async () => {
      await expect(service.findAll({ dateFrom: 'hier' })).rejects.toThrow(BadRequestException);
    });

    it("annonce la troncature de l'export dans la réponse", async () => {
      prisma.auditLog.count.mockResolvedValue(AUDIT_EXPORT_MAX_ROWS + 1);
      const res = await service.findAll({});
      expect(res).toMatchObject({ exportLimit: AUDIT_EXPORT_MAX_ROWS, exportTruncated: true });
    });

    it('résout le nom des entrées tracées par email seul', async () => {
      prisma.auditLog.findMany.mockResolvedValue([log({ userId: null, user: null, userEmail: 'Jean@livio.fr' })]);
      prisma.user.findMany.mockResolvedValue([{ email: 'jean@livio.fr', displayName: 'Jean DUPONT' }]);
      const res = await service.findAll({});
      expect(res.logs[0].user).toEqual({ id: null, displayName: 'Jean DUPONT', email: 'Jean@livio.fr', resolved: true });
    });
  });

  describe('exportCsv', () => {
    it("exporte avec les mêmes filtres, sans IP, et journalise l'export", async () => {
      prisma.auditLog.findMany.mockResolvedValue([log()]);
      const { csv, truncated } = await service.exportCsv({ action: 'bon', user: 'admin' }, 'actor-1');

      expect(truncated).toBe(false);
      expect(csv).toContain('"bon_created";"Admin";"admin@livio.fr"');
      expect(csv).not.toContain('10.0.0.1');
      expect(csv).not.toContain('Firefox');
      const call = prisma.auditLog.findMany.mock.calls[0][0];
      expect(call.take).toBe(AUDIT_EXPORT_MAX_ROWS + 1);
      expect(call.where.action).toEqual({ contains: 'bon', mode: 'insensitive' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'actor-1',
          action: 'audit_exported',
          details: { rowCount: 1, truncated: false, filters: ['user', 'action'] },
        },
      });
    });

    it("plafonne l'export et signale la troncature", async () => {
      const rows = Array.from({ length: AUDIT_EXPORT_MAX_ROWS + 1 }, (_, i) => log({ id: `l${i}` }));
      prisma.auditLog.findMany.mockResolvedValue(rows);
      const { csv, truncated } = await service.exportCsv({}, 'actor-1');
      expect(truncated).toBe(true);
      // en-tête + AUDIT_EXPORT_MAX_ROWS lignes
      expect(csv.split('\n')).toHaveLength(AUDIT_EXPORT_MAX_ROWS + 1);
    });
  });
});
