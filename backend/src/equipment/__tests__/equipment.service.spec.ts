import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EquipmentService } from '../equipment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { EquipmentCategoryEnum, PackItemDto } from '../dto/equipment.dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

describe('EquipmentService', () => {
  let service: EquipmentService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    // equipmentPackItem.count n'existe pas dans le mock partagé
    // (helpers/mock-prisma.ts, hors périmètre de ce lot) : on l'ajoute ici,
    // par défaut sans pack actif référençant l'article.
    prisma.equipmentPackItem.count = jest.fn().mockResolvedValue(0);
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

  function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['category', 'brand', 'model'] },
    });
  }

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

    it('should reject creating a duplicate (category, brand, model) with a clear 400', async () => {
      const dto = {
        category: EquipmentCategoryEnum.pc_portable,
        brand: 'Lenovo',
        model: 'ThinkBook 16 G6',
      };
      prisma.equipmentCatalog.create.mockRejectedValue(uniqueViolation());

      await expect(service.createCatalogItem(dto)).rejects.toThrow(BadRequestException);
      await expect(service.createCatalogItem(dto)).rejects.toThrow(
        'Cet article (catégorie / marque / modèle) existe déjà.',
      );
    });

    it('should update a catalog item (identity field, no signed bon referencing it)', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      const updated = { ...existing, brand: 'HP' };
      prisma.equipmentCatalog.update.mockResolvedValue(updated);

      const result = await service.updateCatalogItem('cat-001', { brand: 'HP' });

      expect(result.brand).toBe('HP');
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { brand: 'HP' },
      });
    });

    it('should update description without checking bon references (non-identity field)', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, description: 'Nouvelle description' };
      prisma.equipmentCatalog.update.mockResolvedValue(updated);

      const result = await service.updateCatalogItem('cat-001', {
        description: 'Nouvelle description',
      });

      expect(result.description).toBe('Nouvelle description');
      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
    });

    it('should reject changing brand/model/category when referenced by a non-draft bon', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(1);

      await expect(
        service.updateCatalogItem('cat-001', { brand: 'HP' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.count).toHaveBeenCalledWith({
        where: { catalogItemId: 'cat-001', bon: { status: { not: 'draft' } } },
      });
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should allow changing category/model when only referenced by draft bons', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, model: 'ThinkBook 16 G7' });

      const result = await service.updateCatalogItem('cat-001', { model: 'ThinkBook 16 G7' });

      expect(result.model).toBe('ThinkBook 16 G7');
    });

    it('should reject updating into a duplicate (category, brand, model) with a clear 400', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockRejectedValue(uniqueViolation());

      await expect(
        service.updateCatalogItem('cat-001', { brand: 'Dell' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateCatalogItem('cat-001', { brand: 'Dell' }),
      ).rejects.toThrow('Cet article (catégorie / marque / modèle) existe déjà.');
    });

    it('should soft-delete (deactivate) a catalog item', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(0);
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
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
    });

    it('should throw when deactivating an item referenced by an active pack', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(2);

      await expect(service.removeCatalogItem('cat-001')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.equipmentPackItem.count).toHaveBeenCalledWith({
        where: { catalogItemId: 'cat-001', pack: { active: true } },
      });
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should reject deactivating via update (active: true -> false) when referenced by an active bon', async () => {
      const existing = catalogItem({ active: true });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(2);

      await expect(
        service.updateCatalogItem('cat-001', { active: false }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.count).toHaveBeenCalledWith({
        where: { catalogItemId: 'cat-001', bon: { status: { notIn: ['cancelled', 'archived'] } } },
      });
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should reject deactivating via update (active: true -> false) when referenced by an active pack', async () => {
      const existing = catalogItem({ active: true });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(1);

      await expect(
        service.updateCatalogItem('cat-001', { active: false }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should allow deactivating via update when not referenced by any active bon or pack', async () => {
      const existing = catalogItem({ active: true });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: false });

      const result = await service.updateCatalogItem('cat-001', { active: false });

      expect(result.active).toBe(false);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: false },
      });
    });

    it('should accept reactivation via update (active: false -> true) without any bon/pack guard', async () => {
      const existing = catalogItem({ active: false });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: true });

      const result = await service.updateCatalogItem('cat-001', { active: true });

      expect(result.active).toBe(true);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: true },
      });
      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
    });

    it('should not re-check the guard when `active` is already false (no-op transition)', async () => {
      const existing = catalogItem({ active: false });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: false });

      await service.updateCatalogItem('cat-001', { active: false });

      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
    });
  });

  // ─── numeros de serie : trim + comparaison insensible a la casse ───────────

  describe('serial number matching', () => {
    it('should trim the query before searching serial history', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([]);

      await service.getSerialHistory('  SN-1234  ');

      expect(prisma.bonEquipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serialNumber: { equals: 'SN-1234', mode: 'insensitive' } },
        }),
      );
    });

    it('should return an empty list for a blank serial history query without hitting the DB', async () => {
      const result = await service.getSerialHistory('   ');

      expect(result).toEqual([]);
      expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
    });

    it('should trim serials and drop blank entries before checking conflicts', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([]);

      await service.findSerialConflicts(['  SN-1  ', '', '   ', 'SN-2']);

      expect(prisma.bonEquipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serialNumber: { in: ['SN-1', 'SN-2'], mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should return an empty list when every serial is blank', async () => {
      const result = await service.findSerialConflicts(['', '   ', '\t']);

      expect(result).toEqual([]);
      expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
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
      prisma.equipmentCatalog.findMany.mockResolvedValue([
        { id: 'cat-001', active: true },
        { id: 'cat-002', active: true },
      ]);
      const created = packFixture();
      prisma.equipmentPack.create.mockResolvedValue(created);

      const result = await service.createPack(dto);

      expect(result).toEqual(created);
      expect(prisma.equipmentCatalog.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['cat-001', 'cat-002'] } },
        select: { id: true, active: true },
      });
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

    it('should reject creating a pack referencing an inactive catalog item', async () => {
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-001', active: false }]);

      await expect(
        service.createPack({ name: 'Pack Test', items: [{ catalogItemId: 'cat-001' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPack.create).not.toHaveBeenCalled();
    });

    it('should reject creating a pack referencing a non-existent catalog item', async () => {
      // cat-999 absent du resultat findMany : introuvable
      prisma.equipmentCatalog.findMany.mockResolvedValue([]);

      await expect(
        service.createPack({ name: 'Pack Test', items: [{ catalogItemId: 'cat-999' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPack.create).not.toHaveBeenCalled();
    });

    it('should update pack (replace items)', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-003', active: true }]);

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

    it('should reject updating a pack to reference an inactive catalog item', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: 'cat-003', active: false }]);

      await expect(
        service.updatePack('pack-001', { items: [{ catalogItemId: 'cat-003' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPackItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.equipmentPack.update).not.toHaveBeenCalled();
    });
  });

  // ─── PackItemDto quantity bounds ────────────────────────────────────────────

  describe('PackItemDto validation', () => {
    async function validateQuantity(quantity: number) {
      const dto = plainToInstance(PackItemDto, { catalogItemId: 'cat-001', quantity });
      return validate(dto);
    }

    it('should accept a quantity within [1, 20]', async () => {
      expect(await validateQuantity(1)).toHaveLength(0);
      expect(await validateQuantity(20)).toHaveLength(0);
    });

    it('should reject a quantity below 1', async () => {
      const errors = await validateQuantity(0);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should reject a quantity above 20', async () => {
      const errors = await validateQuantity(21);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('max');
    });
  });

});
