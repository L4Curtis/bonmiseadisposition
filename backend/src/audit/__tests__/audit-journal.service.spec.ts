import { BadRequestException } from '@nestjs/common';
import { AuditJournalService } from '../audit-journal.service';
import { AuditService } from '../audit.service';
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

const PAGE = { page: 1, limit: 25 };

describe('AuditJournalService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: AuditJournalService;

  function where(): Record<string, unknown> {
    return (prisma.auditLog.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
  }

  beforeEach(() => {
    prisma = createMockPrismaService();
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    service = new AuditJournalService(prisma as never, new AuditService(prisma as never));
  });

  describe('list — filtres', () => {
    it("filtre par auteur sur le nom ET l'email, y compris les entrées tracées par email seul", async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ email: 'jean@livio.fr' }]);
      await service.list({ user: ' Jean ' }, PAGE);

      const contains = { contains: 'Jean', mode: 'insensitive' };
      expect(where().OR).toEqual([
        { userEmail: contains },
        { user: { email: contains } },
        { user: { displayName: contains } },
        { userEmail: { in: ['jean@livio.fr'], mode: 'insensitive' } },
      ]);
    });

    it("accepte encore l'ancien paramètre userEmail", async () => {
      await service.list({ userEmail: 'admin@' }, PAGE);
      expect((where().OR as unknown[])[0]).toEqual({ userEmail: { contains: 'admin@', mode: 'insensitive' } });
    });

    it('filtre une action du catalogue exactement, et la période en jours civils de Paris', async () => {
      await service.list({ action: 'config_updated', dateFrom: '2026-09-01', dateTo: '2026-09-24' }, PAGE);
      expect(where()).toEqual({
        action: 'config_updated',
        createdAt: { gte: new Date('2026-08-31T22:00:00.000Z'), lt: new Date('2026-09-24T22:00:00.000Z') },
      });
      expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: where() });
    });

    it('accepte encore un fragment d’action (ancien filtre libre)', async () => {
      await service.list({ action: 'login' }, PAGE);
      expect(where()).toEqual({ action: { contains: 'login', mode: 'insensitive' } });
    });

    it('filtre par famille d’actions, et combine avec une action', async () => {
      await service.list({ domain: 'config' }, PAGE);
      expect(where()).toEqual({ action: { in: ['config_updated'] } });

      prisma.auditLog.findMany.mockClear();
      await service.list({ domain: 'config', action: 'config_updated' }, PAGE);
      expect(where()).toEqual({ AND: [{ action: 'config_updated' }, { action: { in: ['config_updated'] } }] });
    });

    it('rejette une date invalide', async () => {
      await expect(service.list({ dateFrom: '2026-02-30' }, PAGE)).rejects.toThrow(BadRequestException);
    });

    it('pagine selon la page demandée', async () => {
      await service.list({}, { page: 3, limit: 50 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 50 }));
    });
  });

  describe('list — réponse', () => {
    it('répond à la forme de liste unique et annonce la troncature d’un export', async () => {
      prisma.auditLog.findMany.mockResolvedValue([log()]);
      prisma.auditLog.count.mockResolvedValue(AUDIT_EXPORT_MAX_ROWS + 1);

      const res = await service.list({}, PAGE);

      expect(res).toMatchObject({
        total: AUDIT_EXPORT_MAX_ROWS + 1,
        page: 1,
        limit: 25,
        truncated: false,
        meta: { exportLimit: AUDIT_EXPORT_MAX_ROWS, exportTruncated: true },
      });
      expect(res.items[0].createdAt).toBe('2026-09-24T10:00:00.000Z');
    });

    it('résout le nom des entrées tracées par email seul', async () => {
      prisma.auditLog.findMany.mockResolvedValue([log({ userId: null, user: null, userEmail: 'Jean@livio.fr' })]);
      prisma.user.findMany.mockResolvedValue([{ email: 'jean@livio.fr', displayName: 'Jean DUPONT' }]);

      const res = await service.list({}, PAGE);

      expect(res.items[0].user).toEqual({ id: null, displayName: 'Jean DUPONT', email: 'Jean@livio.fr', resolved: true });
    });
  });

  describe('exportCsv', () => {
    it("exporte lisiblement avec les mêmes filtres, sans IP, et trace l'export", async () => {
      prisma.auditLog.findMany.mockResolvedValue([log()]);

      const { csv, truncated } = await service.exportCsv({ action: 'bon_created', user: 'admin' }, { id: 'actor-1', ip: '10.0.0.9' });

      expect(truncated).toBe(false);
      expect(csv).toContain('"24/09/2026 12:00";"Bon créé"');
      expect(csv).not.toContain('10.0.0.1');
      expect(csv).not.toContain('Firefox');
      const call = prisma.auditLog.findMany.mock.calls[0][0] as { take: number; where: { action: unknown } };
      expect(call.take).toBe(AUDIT_EXPORT_MAX_ROWS + 1);
      expect(call.where.action).toBe('bon_created');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'audit_exported',
          userId: 'actor-1',
          ipAddress: '10.0.0.9',
          details: { rowCount: 1, truncated: false, filters: ['user', 'action'] },
        },
      });
    });

    it("plafonne l'export et signale la troncature", async () => {
      const rows = Array.from({ length: AUDIT_EXPORT_MAX_ROWS + 1 }, (_, i) => log({ id: `l${i}` }));
      prisma.auditLog.findMany.mockResolvedValue(rows);

      const { csv, truncated } = await service.exportCsv({}, { id: 'actor-1' });

      expect(truncated).toBe(true);
      expect(csv.split('\n')).toHaveLength(AUDIT_EXPORT_MAX_ROWS + 1);
    });

    it('livre l’export même si sa trace ne peut pas être écrite', async () => {
      prisma.auditLog.findMany.mockResolvedValue([log()]);
      prisma.auditLog.create.mockRejectedValue(new Error('base indisponible'));

      await expect(service.exportCsv({}, { id: 'actor-1' })).resolves.toMatchObject({ truncated: false });
    });
  });

  it('liste les actions présentes en base', async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ action: 'bon_created' }, { action: 'config_updated' }]);
    await expect(service.distinctActions()).resolves.toEqual(['bon_created', 'config_updated']);
  });
});
