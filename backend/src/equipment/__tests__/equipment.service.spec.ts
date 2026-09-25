import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EquipmentService } from '../equipment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { EquipmentCategoryEnum, PackItemDto } from '../dto/equipment.dto';
import type { Mock } from 'vitest';
import { IN_PROGRESS_BON_STATUSES } from '../../bons/bon-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, Mock>>;

const USER_ID = 'user-001';
const CAT_1 = '11111111-1111-4111-8111-111111111111';
const CAT_2 = '22222222-2222-4222-8222-222222222222';
const CAT_3 = '33333333-3333-4333-8333-333333333333';

describe('EquipmentService', () => {
  let service: EquipmentService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    // equipmentPackItem.count n'existe pas dans le mock partagé
    // (helpers/mock-prisma.ts, hors périmètre de ce lot) : on l'ajoute ici,
    // par défaut sans pack actif référençant l'article.
    prisma.equipmentPackItem.count = vi.fn().mockResolvedValue(0);
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
          catalogItemId: CAT_1,
          quantity: 1,
          order: 0,
          catalogItem: catalogItem(),
        },
      ],
      ...overrides,
    };
  }

  function serialEntryFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: 'be-001',
      serialNumber: 'SN-1234',
      inventoryNumber: null,
      catalogItem: { brand: 'Lenovo', model: 'ThinkBook 16 G6', category: 'pc_portable' },
      customLabel: null,
      returnedAt: null,
      notReturned: false,
      bon: {
        id: 'bon-001',
        reference: 'BON-0001',
        status: 'active',
        dateMiseDisposition: new Date('2026-01-01'),
        dateRestitution: null,
        collaborateur: { displayName: 'Jean Dupont', email: 'jean@example.com' },
        filiale: { displayName: 'Siège' },
      },
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

      const result = await service.createCatalogItem(dto, USER_ID);

      expect(result).toEqual(created);
      expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({ data: dto });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_item_created',
          details: { catalogItemId: 'cat-001', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        },
      });
    });

    it('should reject creating a duplicate (category, brand, model) with a clear 400', async () => {
      const dto = {
        category: EquipmentCategoryEnum.pc_portable,
        brand: 'Lenovo',
        model: 'ThinkBook 16 G6',
      };
      prisma.equipmentCatalog.create.mockRejectedValue(uniqueViolation());

      await expect(service.createCatalogItem(dto, USER_ID)).rejects.toThrow(BadRequestException);
      await expect(service.createCatalogItem(dto, USER_ID)).rejects.toThrow(
        'Cet article (catégorie / marque / modèle) existe déjà.',
      );
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should update a catalog item (identity field, no signed bon referencing it)', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      const updated = { ...existing, brand: 'HP' };
      prisma.equipmentCatalog.update.mockResolvedValue(updated);

      const result = await service.updateCatalogItem('cat-001', { brand: 'HP' }, USER_ID);

      expect(result.brand).toBe('HP');
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { brand: 'HP' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_item_updated',
          details: { catalogItemId: 'cat-001', changes: { brand: { before: 'Lenovo', after: 'HP' } } },
        },
      });
    });

    it('should update description without checking bon references (non-identity field)', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, description: 'Nouvelle description' };
      prisma.equipmentCatalog.update.mockResolvedValue(updated);

      const result = await service.updateCatalogItem('cat-001', {
        description: 'Nouvelle description',
      }, USER_ID);

      expect(result.description).toBe('Nouvelle description');
      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
    });

    it('should reject changing brand/model/category when referenced by a non-draft bon', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(1);

      await expect(
        service.updateCatalogItem('cat-001', { brand: 'HP' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.count).toHaveBeenCalledWith({
        where: { catalogItemId: 'cat-001', bon: { status: { not: 'draft' } } },
      });
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should allow changing category/model when only referenced by draft bons', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, model: 'ThinkBook 16 G7' });

      const result = await service.updateCatalogItem('cat-001', { model: 'ThinkBook 16 G7' }, USER_ID);

      expect(result.model).toBe('ThinkBook 16 G7');
    });

    it('should reject updating into a duplicate (category, brand, model) with a clear 400', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockRejectedValue(uniqueViolation());

      await expect(
        service.updateCatalogItem('cat-001', { brand: 'Dell' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateCatalogItem('cat-001', { brand: 'Dell' }, USER_ID),
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

      const result = await service.removeCatalogItem('cat-001', USER_ID);

      expect(result.active).toBe(false);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_item_disabled',
          details: { catalogItemId: 'cat-001', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        },
      });
    });

    it('should throw when deleting item referenced by active bon', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(3);

      await expect(service.removeCatalogItem('cat-001', USER_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should throw when deactivating an item referenced by an active pack', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(2);

      await expect(service.removeCatalogItem('cat-001', USER_ID)).rejects.toThrow(
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
        service.updateCatalogItem('cat-001', { active: false }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bonEquipment.count).toHaveBeenCalledWith({
        where: { catalogItemId: 'cat-001', bon: { status: { notIn: ['archived', 'cancelled'] } } },
      });
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should reject deactivating via update (active: true -> false) when referenced by an active pack', async () => {
      const existing = catalogItem({ active: true });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(1);

      await expect(
        service.updateCatalogItem('cat-001', { active: false }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should allow deactivating via update when not referenced by any active bon or pack', async () => {
      const existing = catalogItem({ active: true });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentPackItem.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: false });

      const result = await service.updateCatalogItem('cat-001', { active: false }, USER_ID);

      expect(result.active).toBe(false);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_item_disabled',
          details: { catalogItemId: 'cat-001', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        },
      });
    });

    it('should accept reactivation via update (active: false -> true) without any bon/pack guard', async () => {
      const existing = catalogItem({ active: false });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: true });

      const result = await service.updateCatalogItem('cat-001', { active: true }, USER_ID);

      expect(result.active).toBe(true);
      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { active: true },
      });
      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_item_reactivated',
          details: { catalogItemId: 'cat-001', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        },
      });
    });

    it('should not re-check the guard when `active` is already false (no-op transition)', async () => {
      const existing = catalogItem({ active: false });
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.update.mockResolvedValue({ ...existing, active: false });

      await service.updateCatalogItem('cat-001', { active: false }, USER_ID);

      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
      expect(prisma.equipmentPackItem.count).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── normalisation : trim + rejet des chaînes vides ────────────────────────

  describe('normalisation (trim + rejet des chaînes vides)', () => {
    it('should trim brand/model/description on create', async () => {
      prisma.equipmentCatalog.create.mockResolvedValue(catalogItem());

      await service.createCatalogItem({
        category: EquipmentCategoryEnum.pc_portable,
        brand: '  Lenovo  ',
        model: '  ThinkBook 16 G6  ',
        description: '  Laptop pro  ',
      }, USER_ID);

      expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({
        data: {
          category: EquipmentCategoryEnum.pc_portable,
          brand: 'Lenovo',
          model: 'ThinkBook 16 G6',
          description: 'Laptop pro',
        },
      });
    });

    it('should reject a blank brand (whitespace only) on create with a French 400', async () => {
      await expect(
        service.createCatalogItem({ category: EquipmentCategoryEnum.pc_portable, brand: '   ', model: 'X' }, USER_ID),
      ).rejects.toThrow('La marque ne peut pas être vide.');
      expect(prisma.equipmentCatalog.create).not.toHaveBeenCalled();
    });

    it('should reject a blank model (whitespace only) on create with a French 400', async () => {
      await expect(
        service.createCatalogItem({ category: EquipmentCategoryEnum.pc_portable, brand: 'Lenovo', model: '   ' }, USER_ID),
      ).rejects.toThrow('Le modèle ne peut pas être vide.');
    });

    it('should treat a blank description (whitespace only, or empty string) as "no description" rather than rejecting it', async () => {
      // Le formulaire catalogue du frontend envoie systématiquement
      // `description: ''` quand le champ est laissé vide (jamais une clé
      // absente) : un rejet romprait la création d'un article sans
      // description, le cas le plus courant.
      prisma.equipmentCatalog.create.mockResolvedValue(catalogItem());

      await service.createCatalogItem(
        { category: EquipmentCategoryEnum.pc_portable, brand: 'Lenovo', model: 'X', description: '   ' },
        USER_ID,
      );

      expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({
        data: { category: EquipmentCategoryEnum.pc_portable, brand: 'Lenovo', model: 'X', description: undefined },
      });
    });

    it('should trim brand/model/description on update when provided', async () => {
      const existing = catalogItem();
      prisma.equipmentCatalog.findUnique.mockResolvedValue(existing);
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.equipmentCatalog.update.mockResolvedValue(existing);

      await service.updateCatalogItem('cat-001', { brand: '  Dell  ' }, USER_ID);

      expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-001' },
        data: { brand: 'Dell' },
      });
    });

    it('should reject a blank brand (whitespace only) on update with a French 400', async () => {
      prisma.equipmentCatalog.findUnique.mockResolvedValue(catalogItem());

      await expect(
        service.updateCatalogItem('cat-001', { brand: '   ' }, USER_ID),
      ).rejects.toThrow('La marque ne peut pas être vide.');
      expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
    });

    it('should trim the pack name/description on create and reject a blank name', async () => {
      prisma.equipmentPack.create.mockResolvedValue(packFixture());

      await service.createPack({ name: '  Pack Développeur  ', description: '  Un pack  ' }, USER_ID);

      expect(prisma.equipmentPack.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Pack Développeur', description: 'Un pack' }) }),
      );

      await expect(service.createPack({ name: '   ' }, USER_ID)).rejects.toThrow(
        'Le nom du pack ne peut pas être vide.',
      );
    });

    it('should treat a blank pack description as "no description" rather than rejecting it', async () => {
      prisma.equipmentPack.create.mockResolvedValue(packFixture());

      await service.createPack({ name: 'Pack Test', description: '   ' }, USER_ID);

      expect(prisma.equipmentPack.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Pack Test', description: undefined }) }),
      );
    });

    it('should trim the pack name on update when provided and reject a blank name', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentPack.update.mockResolvedValue(existing);

      await service.updatePack('pack-001', { name: '  Pack Designer  ' }, USER_ID);

      expect(prisma.equipmentPack.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Pack Designer' }) }),
      );

      await expect(service.updatePack('pack-001', { name: '   ' }, USER_ID)).rejects.toThrow(
        'Le nom du pack ne peut pas être vide.',
      );
    });
  });

  // ─── historique matériel : n° de série OU n° d'inventaire, trim + casse + troncature

  describe('equipment history (serial number OR inventory number)', () => {
    it('should trim the query before searching equipment history', async () => {
      prisma.bonEquipment.count.mockResolvedValue(0);
      prisma.bonEquipment.findMany.mockResolvedValue([]);

      await service.getEquipmentHistory('  SN-1234  ');

      expect(prisma.bonEquipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { serialNumber: { equals: 'SN-1234', mode: 'insensitive' } },
              { inventoryNumber: { equals: 'SN-1234', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('should return an empty envelope for a blank query without hitting the DB', async () => {
      const result = await service.getEquipmentHistory('   ');

      expect(result).toEqual({ items: [], truncated: false, total: 0 });
      expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
      expect(prisma.bonEquipment.count).not.toHaveBeenCalled();
    });

    it('should return items with truncated=false when the total is within the limit', async () => {
      prisma.bonEquipment.count.mockResolvedValue(1);
      prisma.bonEquipment.findMany.mockResolvedValue([serialEntryFixture()]);

      const result = await service.getEquipmentHistory('SN-1234');

      expect(result.truncated).toBe(false);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ equipmentId: 'be-001', serialNumber: 'SN-1234', label: 'Lenovo ThinkBook 16 G6' }),
      );
    });

    it('should signal truncation explicitly when more than 200 entries exist', async () => {
      prisma.bonEquipment.count.mockResolvedValue(250);
      prisma.bonEquipment.findMany.mockResolvedValue([serialEntryFixture()]);

      const result = await service.getEquipmentHistory('SN-1234');

      expect(result.truncated).toBe(true);
      expect(result.total).toBe(250);
    });

    it('should match and return a bon equipment found only by its inventory number', async () => {
      prisma.bonEquipment.count.mockResolvedValue(1);
      prisma.bonEquipment.findMany.mockResolvedValue([
        serialEntryFixture({ serialNumber: null, inventoryNumber: 'INV-5678' }),
      ]);

      const result = await service.getEquipmentHistory('INV-5678');

      expect(result.items[0]).toEqual(
        expect.objectContaining({ serialNumber: null, inventoryNumber: 'INV-5678' }),
      );
    });

    it('should build the CSV export from the same history and pass through truncated', async () => {
      prisma.bonEquipment.count.mockResolvedValue(1);
      prisma.bonEquipment.findMany.mockResolvedValue([serialEntryFixture()]);

      const { csv, truncated } = await service.getEquipmentHistoryCsv('SN-1234');

      expect(truncated).toBe(false);
      expect(csv).toContain('BON-0001');
      expect(csv).toContain('SN-1234');
    });

    it('should trim serials and drop blank entries before checking conflicts', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([]);

      const result = await service.findSerialConflicts(['  SN-1  ', '', '   ', 'SN-2']);

      expect(prisma.bonEquipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serialNumber: { in: ['SN-1', 'SN-2'], mode: 'insensitive' },
          }),
        }),
      );
      expect(result).toEqual({ items: [], truncated: false });
    });

    it('should return an empty envelope when every serial is blank', async () => {
      const result = await service.findSerialConflicts(['', '   ', '\t']);

      expect(result).toEqual({ items: [], truncated: false });
      expect(prisma.bonEquipment.findMany).not.toHaveBeenCalled();
    });

    it('only looks at unreturned equipment on bons still in progress, excluding the given bon', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([]);

      await service.findSerialConflicts(['SN-1'], 'bon-current');

      const { where } = prisma.bonEquipment.findMany.mock.calls[0][0];
      expect(where).toMatchObject({ returnedAt: null, notReturned: false });
      expect(where.bon.id).toEqual({ not: 'bon-current' });
      expect(where.bon.status.in).toEqual([...IN_PROGRESS_BON_STATUSES]);
    });

    it('maps each conflict to the bon it is found on', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([
        {
          serialNumber: 'SN-1',
          bon: { id: 'bon-9', reference: 'BON-2026-0099', status: 'active', collaborateur: { displayName: 'Jean Dupont' } },
        },
      ]);

      const result = await service.findSerialConflicts(['SN-1']);

      expect(result).toEqual({
        items: [
          { serialNumber: 'SN-1', bonId: 'bon-9', bonReference: 'BON-2026-0099', bonStatus: 'active', collaborateur: 'Jean Dupont' },
        ],
        truncated: false,
      });
    });

    it('should signal truncation explicitly when more than 50 distinct serials are provided', async () => {
      prisma.bonEquipment.findMany.mockResolvedValue([]);
      const serials = Array.from({ length: 60 }, (_, i) => `SN-${i}`);

      const result = await service.findSerialConflicts(serials);

      expect(result.truncated).toBe(true);
      const calledWith = prisma.bonEquipment.findMany.mock.calls[0][0];
      expect(calledWith.where.serialNumber.in).toHaveLength(50);
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
          { catalogItemId: CAT_1, quantity: 1, order: 0 },
          { catalogItemId: CAT_2, quantity: 2, order: 1 },
        ],
      };
      prisma.equipmentCatalog.findMany.mockResolvedValue([
        { id: CAT_1, active: true },
        { id: CAT_2, active: true },
      ]);
      const created = packFixture();
      prisma.equipmentPack.create.mockResolvedValue(created);

      const result = await service.createPack(dto, USER_ID);

      expect(result).toEqual(created);
      expect(prisma.equipmentCatalog.findMany).toHaveBeenCalledWith({
        where: { id: { in: [CAT_1, CAT_2] } },
        select: { id: true, active: true },
      });
      expect(prisma.equipmentPack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Pack Developpeur',
            description: 'Laptop + ecran',
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ catalogItemId: CAT_1, quantity: 1, order: 0 }),
                expect.objectContaining({ catalogItemId: CAT_2, quantity: 2, order: 1 }),
              ]),
            }),
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'pack_created',
          details: {
            packId: created.id,
            name: created.name,
            items: [
              { catalogItemId: CAT_1, quantity: 1 },
              { catalogItemId: CAT_2, quantity: 2 },
            ],
          },
        },
      });
    });

    it('should reject creating a pack referencing an inactive catalog item', async () => {
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: CAT_1, active: false }]);

      await expect(
        service.createPack({ name: 'Pack Test', items: [{ catalogItemId: CAT_1 }] }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPack.create).not.toHaveBeenCalled();
    });

    it('should reject creating a pack referencing a non-existent catalog item', async () => {
      // CAT_3 absent du resultat findMany : introuvable
      prisma.equipmentCatalog.findMany.mockResolvedValue([]);

      await expect(
        service.createPack({ name: 'Pack Test', items: [{ catalogItemId: CAT_3 }] }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPack.create).not.toHaveBeenCalled();
    });

    it('should update pack (replace items) and audit the diff', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.findMany.mockResolvedValue([
        { id: CAT_1, active: true },
        { id: CAT_2, active: true },
      ]);

      const updatedPack = {
        ...existing,
        name: 'Pack Designer',
        items: [
          {
            id: 'pack-item-new-001',
            packId: 'pack-001',
            catalogItemId: CAT_2,
            quantity: 1,
            order: 0,
            catalogItem: catalogItem({ id: CAT_2, brand: 'Apple', model: 'MacBook Pro' }),
          },
        ],
      };

      // $transaction passes the mock prisma to the callback
      prisma.equipmentPackItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.equipmentPackItem.createMany.mockResolvedValue({ count: 1 });
      prisma.equipmentPack.update.mockResolvedValue(updatedPack);

      const result = await service.updatePack('pack-001', {
        name: 'Pack Designer',
        items: [
          { catalogItemId: CAT_1, quantity: 3, order: 0 },
          { catalogItemId: CAT_2, quantity: 1, order: 1 },
        ],
      }, USER_ID);

      expect(result.name).toBe('Pack Designer');
      // Verify old items were deleted and new ones created
      expect(prisma.equipmentPackItem.deleteMany).toHaveBeenCalledWith({
        where: { packId: 'pack-001' },
      });
      expect(prisma.equipmentPackItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ packId: 'pack-001', catalogItemId: CAT_1, quantity: 3, order: 0 }),
          expect.objectContaining({ packId: 'pack-001', catalogItemId: CAT_2, quantity: 1, order: 1 }),
        ],
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'pack_updated',
          details: { packId: 'pack-001', changes: { name: { before: 'Pack Developpeur', after: 'Pack Designer' } } },
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'pack_items_changed',
          details: {
            packId: 'pack-001',
            added: [CAT_2],
            removed: [],
            quantityChanged: [{ catalogItemId: CAT_1, before: 1, after: 3 }],
          },
        },
      });
    });

    it('should reject updating a pack to reference an inactive catalog item', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentCatalog.findMany.mockResolvedValue([{ id: CAT_3, active: false }]);

      await expect(
        service.updatePack('pack-001', { items: [{ catalogItemId: CAT_3 }] }, USER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.equipmentPackItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.equipmentPack.update).not.toHaveBeenCalled();
    });

    it('should audit pack_disabled when deactivating via update (active: true -> false)', async () => {
      const existing = packFixture({ active: true });
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentPack.update.mockResolvedValue({ ...existing, active: false });

      await service.updatePack('pack-001', { active: false }, USER_ID);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, action: 'pack_disabled', details: { packId: 'pack-001', name: 'Pack Developpeur' } },
      });
    });

    it('should audit pack_reactivated when reactivating via update (active: false -> true)', async () => {
      const existing = packFixture({ active: false });
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentPack.update.mockResolvedValue({ ...existing, active: true });

      await service.updatePack('pack-001', { active: true }, USER_ID);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, action: 'pack_reactivated', details: { packId: 'pack-001', name: 'Pack Developpeur' } },
      });
    });

    it('should soft-delete (deactivate) a pack and audit pack_disabled', async () => {
      const existing = packFixture();
      prisma.equipmentPack.findUnique.mockResolvedValue(existing);
      prisma.equipmentPack.update.mockResolvedValue({ ...existing, active: false });

      const result = await service.removePack('pack-001', USER_ID);

      expect(result.active).toBe(false);
      expect(prisma.equipmentPack.update).toHaveBeenCalledWith({ where: { id: 'pack-001' }, data: { active: false } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, action: 'pack_disabled', details: { packId: 'pack-001', name: 'Pack Developpeur' } },
      });
    });
  });

  // ─── import en masse du catalogue ───────────────────────────────────────────

  describe('importCatalog', () => {
    it('should delegate to importCatalogItems and return its result', async () => {
      prisma.equipmentCatalog.findMany.mockResolvedValue([]);
      prisma.equipmentCatalog.create.mockResolvedValue(catalogItem());

      const result = await service.importCatalog(
        { items: [{ category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' }] },
        USER_ID,
      );

      expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          action: 'catalog_imported',
          details: { created: 1, updated: 0, skipped: 0, errorCount: 0 },
        },
      });
    });
  });

  // ─── PackItemDto validation ────────────────────────────────────────────────

  describe('PackItemDto validation', () => {
    async function validateQuantity(quantity: number) {
      const dto = plainToInstance(PackItemDto, { catalogItemId: CAT_1, quantity });
      return validate(dto);
    }

    it('should accept a quantity within [1, 20]', async () => {
      expect(await validateQuantity(1)).toHaveLength(0);
      expect(await validateQuantity(20)).toHaveLength(0);
    });

    it('should reject a quantity below 1', async () => {
      const errors = await validateQuantity(0);
      const quantityError = errors.find((e) => e.property === 'quantity');
      expect(quantityError?.constraints).toHaveProperty('min');
    });

    it('should reject a quantity above 20', async () => {
      const errors = await validateQuantity(21);
      const quantityError = errors.find((e) => e.property === 'quantity');
      expect(quantityError?.constraints).toHaveProperty('max');
    });

    it('should reject a malformed (non-UUID) catalogItemId', async () => {
      const dto = plainToInstance(PackItemDto, { catalogItemId: 'not-a-uuid', quantity: 1 });
      const errors = await validate(dto);
      const idError = errors.find((e) => e.property === 'catalogItemId');
      expect(idError?.constraints).toHaveProperty('isUuid');
    });
  });
});
