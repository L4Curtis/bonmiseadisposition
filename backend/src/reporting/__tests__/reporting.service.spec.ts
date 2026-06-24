import { ReportingService } from '../reporting.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('ReportingService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: ReportingService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new ReportingService(prisma as never);
    // Défauts pour le bloc failedNotifications de getOverview
    (prisma.notificationLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.notificationLog.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('getOverview', () => {
    it('aggregates circulating equipment by category and filiale', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        { customLabel: null, catalogItem: { category: 'pc_portable', brand: 'Dell', model: 'X' }, bon: { id: 'b1', filiale: { displayName: 'Paris' } } },
        { customLabel: null, catalogItem: { category: 'pc_portable', brand: 'HP', model: 'Y' }, bon: { id: 'b1', filiale: { displayName: 'Paris' } } },
        { customLabel: 'Adaptateur', catalogItem: null, bon: { id: 'b2', filiale: { displayName: 'Lyon' } } },
      ]);
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([]); // overdue
      (prisma.bon.count as jest.Mock).mockResolvedValue(0); // monthly

      const r = await service.getOverview();

      expect(r.circulating.totalEquipments).toBe(3);
      expect(r.circulating.totalBons).toBe(2); // b1, b2
      const pc = r.circulating.byCategory.find((c) => c.category === 'pc_portable');
      expect(pc?.count).toBe(2);
      const autre = r.circulating.byCategory.find((c) => c.category === 'autre');
      expect(autre?.count).toBe(1); // sans catalogItem → 'autre'
      const paris = r.circulating.byFiliale.find((f) => f.name === 'Paris');
      expect(paris?.count).toBe(2);
    });

    it('flags overdue bons with day counts and department aggregation', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'b1', reference: 'BMD-1', status: 'sent_mise_dispo', updatedAt: tenDaysAgo,
          collaborateur: { displayName: 'Jean', email: 'j@x.fr', department: 'IT' },
          filiale: { displayName: 'Paris' },
        },
      ]);
      (prisma.bon.count as jest.Mock).mockResolvedValue(0);

      const r = await service.getOverview();

      expect(r.overdue.count).toBe(1);
      expect(r.overdue.items[0].days).toBeGreaterThanOrEqual(9);
      expect(r.overdue.byDepartment[0]).toEqual({ name: 'IT', count: 1 });
    });

    it('returns 12 monthly buckets', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bon.count as jest.Mock).mockResolvedValue(3);

      const r = await service.getOverview();
      expect(r.monthly).toHaveLength(12);
      expect(r.monthly[0].month).toMatch(/^\d{4}-\d{2}$/);
      expect(r.monthly[0].created).toBe(3);
    });

    it('surfaces failed notifications (emails non délivrés)', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bon.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bon.count as jest.Mock).mockResolvedValue(0);
      (prisma.notificationLog.count as jest.Mock).mockResolvedValue(1);
      (prisma.notificationLog.findMany as jest.Mock).mockResolvedValue([
        { id: 'n1', recipientEmail: 'x@y.fr', type: 'mise_dispo_request', sentAt: new Date(), errorMessage: 'SMTP refusé', bon: { id: 'b1', reference: 'BMD-1' } },
      ]);

      const r = await service.getOverview();
      expect(r.failedNotifications.count).toBe(1);
      expect(r.failedNotifications.items[0].reference).toBe('BMD-1');
      expect(r.failedNotifications.items[0].error).toBe('SMTP refusé');
    });
  });

  describe('getCirculatingCsv', () => {
    it('produces a BOM-prefixed CSV with a header row', async () => {
      (prisma.bonEquipment.findMany as jest.Mock).mockResolvedValue([
        {
          customLabel: null, serialNumber: 'SN1', inventoryNumber: 'INV1',
          catalogItem: { category: 'ecran', brand: 'LG', model: '27"' },
          bon: {
            reference: 'BMD-1', dateMiseDisposition: new Date('2026-01-10'), dateRestitution: null,
            collaborateur: { displayName: 'Jean', email: 'j@x.fr', department: 'IT' },
            filiale: { displayName: 'Paris' },
          },
        },
      ]);

      const csv = await service.getCirculatingCsv();
      expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
      expect(csv).toContain('Référence');
      expect(csv).toContain('BMD-1');
      expect(csv).toContain('SN1');
    });
  });
});
