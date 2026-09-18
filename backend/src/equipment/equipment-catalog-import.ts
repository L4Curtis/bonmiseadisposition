import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ImportCatalogItemDto, ImportCatalogResult } from './dto/equipment.dto';

/** Concatène les messages de contrainte (`class-validator`) d'une ligne
 *  invalide en une seule chaîne lisible pour `errors[].message`. */
function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join(' ');
}

/** Clé de comparaison insensible à la casse (category, brand, model), même
 *  logique que l'index unique fonctionnel posé en migration. */
function catalogKey(category: string, brand: string, model: string): string {
  return `${category}::${brand.toLowerCase()}::${model.toLowerCase()}`;
}

interface ExistingCatalogEntry {
  id: string;
  category: string;
  brand: string;
  model: string;
  active: boolean;
}

/**
 * Import en masse du catalogue (POST /equipment/catalog/import) :
 * - trim + comparaison insensible à la casse avec l'existant ;
 * - article identique déjà actif → `skipped` ;
 * - article identique désactivé → réactivé, compté dans `updated` ;
 * - sinon → créé ;
 * - ligne invalide → entrée dans `errors`, SANS interrompre le reste.
 * Traité séquentiellement (max 500 lignes, opération admin peu fréquente) :
 * pas de transaction globale, car une ligne en erreur ne doit pas annuler les
 * lignes déjà traitées avec succès.
 */
export async function importCatalogItems(
  prisma: PrismaService,
  rawItems: unknown[],
  userId: string,
): Promise<ImportCatalogResult> {
  const result: ImportCatalogResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  const existing = await prisma.equipmentCatalog.findMany({
    select: { id: true, category: true, brand: true, model: true, active: true },
  });
  const byKey = new Map<string, ExistingCatalogEntry>(
    existing.map((item) => [catalogKey(item.category, item.brand, item.model), item]),
  );

  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      result.errors.push({ index, message: 'Ligne invalide : un objet est attendu.' });
      continue;
    }

    const instance = plainToInstance(ImportCatalogItemDto, raw as Record<string, unknown>);
    const violations = await validate(instance);
    if (violations.length > 0) {
      result.errors.push({ index, message: formatValidationErrors(violations) });
      continue;
    }

    const key = catalogKey(instance.category, instance.brand, instance.model);
    const found = byKey.get(key);

    if (found) {
      if (found.active) {
        result.skipped++;
        continue;
      }
      await prisma.equipmentCatalog.update({ where: { id: found.id }, data: { active: true } });
      byKey.set(key, { ...found, active: true });
      result.updated++;
      continue;
    }

    const created = await prisma.equipmentCatalog.create({
      data: {
        category: instance.category,
        brand: instance.brand,
        model: instance.model,
        description: instance.description,
      },
    });
    byKey.set(key, { id: created.id, category: created.category, brand: created.brand, model: created.model, active: true });
    result.created++;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'catalog_imported',
      details: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
    },
  });

  return result;
}
