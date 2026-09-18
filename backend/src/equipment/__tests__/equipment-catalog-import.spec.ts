import 'reflect-metadata';
import { importCatalogItems } from '../equipment-catalog-import';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

const USER_ID = 'user-001';

describe('importCatalogItems (POST /equipment/catalog/import)', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
  });

  it('should create a brand-new item', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', description: 'Laptop' }],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({
      data: { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', description: 'Laptop' },
    });
  });

  it('should trim brand/model/description before comparing/creating', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: '  Lenovo  ', model: '  ThinkBook 16 G6  ' }],
      USER_ID,
    );

    expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({
      data: { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', description: undefined },
    });
  });

  it('should accept an empty-string description (CSV export with no description column) without an error', async () => {
    // Le CSV exporté par le frontend envoie toujours une colonne description,
    // vide quand elle n'est pas renseignée — ce n'est pas une ligne invalide.
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'HP', model: 'X', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: 'HP', model: 'X', description: '' }],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(prisma.equipmentCatalog.create).toHaveBeenCalledWith({
      data: { category: 'pc_portable', brand: 'HP', model: 'X', description: undefined },
    });
  });

  it('should skip an item that already exists and is active (case-insensitive match)', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([
      { id: 'cat-001', category: 'pc_portable', brand: 'Dell', model: 'Latitude', active: true },
    ]);

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: 'dell', model: 'LATITUDE' }],
      USER_ID,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect(prisma.equipmentCatalog.create).not.toHaveBeenCalled();
    expect(prisma.equipmentCatalog.update).not.toHaveBeenCalled();
  });

  it('should reactivate a disabled duplicate and count it as updated', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([
      { id: 'cat-001', category: 'pc_portable', brand: 'Dell', model: 'Latitude', active: false },
    ]);
    prisma.equipmentCatalog.update.mockResolvedValue({
      id: 'cat-001', category: 'pc_portable', brand: 'Dell', model: 'Latitude', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: 'dell', model: 'latitude' }],
      USER_ID,
    );

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    expect(prisma.equipmentCatalog.update).toHaveBeenCalledWith({ where: { id: 'cat-001' }, data: { active: true } });
    expect(prisma.equipmentCatalog.create).not.toHaveBeenCalled();
  });

  it('should collect a per-row error without interrupting the rest of the batch', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [
        { category: 'pc_portable', brand: '', model: 'ThinkBook' }, // invalide : brand vide
        { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' }, // valide
        { category: 'not_a_real_category', brand: 'X', model: 'Y' }, // invalide : category
        'not-an-object', // invalide : pas un objet
      ],
      USER_ID,
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].index).toBe(0);
    expect(result.errors[1].index).toBe(2);
    expect(result.errors[2].index).toBe(3);
    expect(prisma.equipmentCatalog.create).toHaveBeenCalledTimes(1);
  });

  it('should treat a second identical row in the same batch as a duplicate (created once, then skipped)', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [
        { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        { category: 'pc_portable', brand: 'LENOVO', model: 'thinkbook 16 g6' },
      ],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, errors: [] });
    expect(prisma.equipmentCatalog.create).toHaveBeenCalledTimes(1);
  });

  it('should treat rows differing only by surrounding whitespace as the same internal duplicate (trimmed before comparison)', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [
        { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        { category: 'pc_portable', brand: '  Lenovo  ', model: '  ThinkBook 16 G6  ' },
      ],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, errors: [] });
    expect(prisma.equipmentCatalog.create).toHaveBeenCalledTimes(1);
  });

  it('should reject a row whose catalogItemId-less shape has an oversized brand (MaxLength)', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'pc_portable', brand: 'A'.repeat(101), model: 'X' }],
      USER_ID,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.created).toBe(0);
  });

  it('should always write a catalog_imported audit entry with the final counters', async () => {
    prisma.equipmentCatalog.findMany.mockResolvedValue([]);
    prisma.equipmentCatalog.create.mockResolvedValue({
      id: 'cat-new', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
    });

    await importCatalogItems(
      prisma as unknown as PrismaService,
      [
        { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6' },
        { category: 'bad', brand: 'X', model: 'Y' },
      ],
      USER_ID,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: 'catalog_imported',
        details: { created: 1, updated: 0, skipped: 0, errorCount: 1 },
      },
    });
  });
});
