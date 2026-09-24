import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportCatalogDto, ImportCatalogItemDto } from '../dto/equipment.dto';
import { importCatalogItems } from '../equipment-catalog-import';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

/**
 * Durcissement de l'import du catalogue (POST /equipment/catalog/import) :
 * - une catégorie inconnue doit produire un message listant les valeurs
 *   acceptées, exploitable sans consulter le code ;
 * - un import de plus de 500 lignes doit être rejeté par une 400 claire, via
 *   la contrainte `@ArrayMaxSize` posée sur `ImportCatalogDto.items` (le
 *   `ValidationPipe` global du contrôleur applique cette même validation).
 */
describe('Import catalogue — durcissement (categories + limite de lignes)', () => {
  it('lists every accepted category in the validation message for an unknown category', async () => {
    const instance = plainToInstance(ImportCatalogItemDto, {
      category: 'not_a_real_category',
      brand: 'Dell',
      model: 'Latitude',
    });

    const violations = await validate(instance);
    const messages = violations.flatMap((v) => Object.values(v.constraints ?? {})).join(' ');

    for (const category of [
      'pc_portable', 'pc_fixe', 'ecran', 'souris', 'clavier',
      'casque', 'telephone', 'housse', 'dock', 'cable', 'autre',
    ]) {
      expect(messages).toContain(category);
    }
  });

  it('surfaces the category message (with accepted values) through importCatalogItems as a per-row error', async () => {
    const prisma = createMockPrismaService();
    (prisma.equipmentCatalog.findMany as Mock).mockResolvedValue([]);

    const result = await importCatalogItems(
      prisma as unknown as PrismaService,
      [{ category: 'bogus', brand: 'Dell', model: 'Latitude' }],
      'user-001',
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('pc_portable');
    expect(result.errors[0].message).toContain('autre');
  });

  it('rejects a payload of more than 500 items with a clear 400 message', async () => {
    const dto = plainToInstance(ImportCatalogDto, {
      items: Array.from({ length: 501 }, () => ({ category: 'autre', brand: 'X', model: 'Y' })),
    });

    const violations = await validate(dto);

    expect(violations.length).toBeGreaterThan(0);
    const messages = violations.flatMap((v) => Object.values(v.constraints ?? {})).join(' ');
    expect(messages).toContain('500');
  });

  it('accepts exactly 500 items without a size violation', async () => {
    const dto = plainToInstance(ImportCatalogDto, {
      items: Array.from({ length: 500 }, () => ({ category: 'autre', brand: 'X', model: 'Y' })),
    });

    const violations = await validate(dto);

    expect(violations).toHaveLength(0);
  });
});
