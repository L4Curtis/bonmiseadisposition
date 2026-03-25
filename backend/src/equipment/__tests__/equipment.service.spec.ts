import { BadRequestException } from '@nestjs/common';
import { EquipmentService } from '../equipment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { EquipmentCategoryEnum } from '../dto/equipment.dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

describe('EquipmentService', () => {
  let service: EquipmentService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    service = new EquipmentService(prisma as unknown as PrismaService);
  });

  // ─── Catalog item fixtures ─────────────────────────────────────────────────

  function catalogItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cat-001',
      category: 'pc_portable',
      brand: 'Lenovo',
      model: 'ThinkBook 16 G6',
      description: 'Laptop professionnel',
      active: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function packFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pack-001',
      name: 'Pack Developpeur',
      description: 'Laptop + ecran + souris',
      active: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      items: [
        {
          id: 'pack-item-001',
          packId: 'pack-001',
          catalogItemId: 'cat-001',
          quantity: 1,
          order: 0,
          catalogItem: catalogItem(),
        },
      ],
      ...overrides,
    };
  }

  // ─── catalog CRUD ──────────────────────────────────────────────────────────

  describe('catalog CRUD', () => {
    it('should find all catalog items', async () => {
      const items = [catalogItem(), catalogItem({ id: 'cat-002', brand: 'Dell' })];
      prisma.equipmentCatalog.findMany.mockResolvedValue(items);

      const result = await service.findAllCatalog();

      expect(result).toEqual(items);
      expect(prisma.equipmentCatalog.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
      });
    });

    it('should find active catalog items', async () => {
      const items = [catalogItem()];
      prisma.equipmentCatalog.findMany.mockResolvedValue(items);

      const result = await service.findActiveCatalog();

      expect(result).toEqual(items);
      expect(prisma.equipmentCatalog.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
      });
    });

    it('should search catalog', async () => {
      const items = [catalogItem()];
      prisma.equipmentCatalog.findMany.mockResolvedValue(items);

      const result = await service.searchCatalog('Lenovo');

      expect(result).toEqual(items);
      expect(prisma.equipmentCatalog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active: true,
            OR: expect.arrayContaining([
              { brand: { contains: 'Lenovo', mode: 'insensitive' } },
            ]),
          }),
          take: 20,
        }),
      );
    });

    it('should create a catalog item', async () => {
      const dto = {
        category: EquipmentCategoryEnum.pc_portable,
        brand: 'Lenovo',
        model: 'ThinkBook 16 G6',
      };
      const created = catalogItem();
      prisma.equipmentCatalog.create.mockResolvedValue(created);

      const result = await service.createCatalogItem(dto);

      expect(result).toEqual(created);
      expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({ data: dto });
    });

    it('should update a catalog item', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, brand: 'HP' };
      prisma.equipmentCatalog.update.mockResolvedValue(updated);

      const result = await service.updateCatalogItem('cat-001', { brand: 'HP' });

      expect(result.brand).toBe('HP');
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { brand: 'HP' },
      });
    });

    it('should soft-delete (deactivate) a catalog item', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue({
        ...existing,
        active: false,
      });

      const result = await service.removeCatalogItem('cat-001');

      expect(result.active).toBe(false);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: false },
      });
    });

    it('should throw when deleting item referenced by active bon', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(3);

      await expect(service.removeCatalogItem('cat-001')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── packs CRUD ────────────────────────────────────────────────────────────

  describe('packs CRUD', () => {
    it('should find all packs', async () => {
      const packs = [packFixture()];
      prisma.equipmentPack.findMany.mockResolvedValue(packs);

      const result = await service.findAllPacks();

      expect(result).toEqual(packs);
      expect(prisma.equipmentPack.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              include: { catalogItem: true },
            }),
          }),
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should create pack with items', async () => {
      const dto = {
        name: 'Pack Developpeur',
        description: 'Laptop + ecran',
        items: [
          { catalogItemId: 'cat-001', quantity: 1, order: 0 },
          { catalogItemId: 'cat-002', quantity: 2, order: 1 },
        ],
      };
      const created = packFixture();
      prisma.equipmentPack.create.mockResolvedValue(created);

      const result = await service.createPack(dto);

      expect(result).toEqual(created);
      expect(prisma.equipmentPack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Pack Developpeur',
            description: 'Laptop + ecran',
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ catalogItemId: 'cat-001', quantity: 1, order: 0 }),
                expect.objectContaining({ catalogItemId: 'cat-002', quantity: 2, order: 1 }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should update pack (replace items)', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);

      const updatedPack = {
        ...existing,
        name: 'Pack Designer',
        items: [
          {
            id: 'pack-item-new-001',
            packId: 'pack-001',
            catalogItemId: 'cat-003',
            quantity: 1,
            order: 0,
            catalogItem: catalogItem({ id: 'cat-003', brand: 'Apple', model: 'MacBook Pro' }),
          },
        ],
      };

      // $transaction passes the mock prisma to the callback
      prisma.equipmentPackItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.equipmentPackItem.createMany.mockResolvedValue({ count: 1 });
      prisma.equipmentPack.update.mockResolvedValue(updatedPack);

      const result = await service.updatePack('pack-001', {
        name: 'Pack Designer',
        items: [{ catalogItemId: 'cat-003', quantity: 1, order: 0 }],
      });

      expect(result.name).toBe('Pack Designer');
      // Verify old items were deleted and new ones created
      expect(prisma.equipmentPackItem.deleteMany).toHaveBeenCalledWith({
        where: { packId: 'pack-001' },
      });
      expect(prisma.equipmentPackItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            packId: 'pack-001',
            catalogItemId: 'cat-003',
            quantity: 1,
            order: 0,
          }),
        ],
      });
    });
  });
});
