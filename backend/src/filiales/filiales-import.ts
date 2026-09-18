import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ImportFilialeItemDto, ImportFilialesResult } from './dto/filiale.dto';
import { saveFilialeImageFromBase64, deleteFilialeUpload } from './filiales-image';

/** Concatène les messages de contrainte (`class-validator`) d'une ligne
 *  invalide en une seule chaîne lisible pour `errors[].message` — même
 *  logique que equipment-catalog-import.ts#formatValidationErrors. */
function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join(' ');
}

interface ExistingFilialeEntry {
  id: string;
  name: string;
  displayName: string;
  address: string | null;
  siret: string | null;
  active: boolean;
  logoPath: string | null;
  stampPath: string | null;
}

/** Champs Prisma effectivement modifiables par une ligne d'import — jamais
 *  `name` (c'est la clé de rapprochement avec l'existant : la renommer via
 *  l'import romprait le matching lui-même). */
interface FilialeChanges {
  displayName?: string;
  address?: string;
  siret?: string;
  active?: boolean;
  logoPath?: string;
  stampPath?: string;
}

/**
 * Import en masse des filiales (POST /filiales/import) :
 * - `name` nettoyé (trim, 1 à 100 caractères) sert de clé de rapprochement,
 *   insensible à la casse, avec l'existant (index fonctionnel unique déjà en
 *   base — migration 20260916100400_unique_constraints) ;
 * - filiale existante → mise à jour des SEULS champs fournis par la ligne,
 *   comptée dans `updated`, sauf si aucun champ fourni ne diffère de
 *   l'existant (`skipped`) ;
 * - sinon → création, `displayName` par défaut égal à `name` ;
 * - `logoBase64`/`stampBase64` (base64 nu ou data URL) sont décodés, validés
 *   (type réel PNG/JPEG par octets magiques, taille ≤ 2 Mo) et écrits sur
 *   disque par filiales-image.ts AVANT tout accès Prisma pour la ligne — une
 *   image invalide échoue SEULEMENT cette ligne (`errors`), sans écriture
 *   partielle ni interruption du lot ;
 * - une ligne invalide (shape, validation, image) produit une entrée dans
 *   `errors`, SANS interrompre le reste de l'import.
 * Traité séquentiellement (max 200 lignes, opération admin peu fréquente) :
 * pas de transaction globale, par cohérence avec importCatalogItems
 * (equipment-catalog-import.ts) — une ligne en erreur ne doit pas annuler
 * les lignes déjà traitées avec succès.
 */
export async function importFilialeItems(
  prisma: PrismaService,
  rawItems: unknown[],
  userId: string,
): Promise<ImportFilialesResult> {
  const result: ImportFilialesResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  const existing = await prisma.filiale.findMany({
    select: {
      id: true, name: true, displayName: true, address: true, siret: true,
      active: true, logoPath: true, stampPath: true,
    },
  });
  const byName = new Map<string, ExistingFilialeEntry>(
    existing.map((f) => [f.name.toLowerCase(), f]),
  );

  for (let index = 0; index < rawItems.length; index++) {
    const raw = rawItems[index];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      result.errors.push({ index, message: 'Ligne invalide : un objet est attendu.' });
      continue;
    }

    const instance = plainToInstance(ImportFilialeItemDto, raw as Record<string, unknown>);
    const violations = await validate(instance);
    if (violations.length > 0) {
      result.errors.push({ index, message: formatValidationErrors(violations) });
      continue;
    }

    // Images : décodées/écrites AVANT tout accès Prisma — une image invalide
    // n'échoue que cette ligne, sans jamais créer/modifier la filiale avec un
    // logo/cachet à moitié traité.
    let logoPath: string | undefined;
    let stampPath: string | undefined;
    try {
      if (instance.logoBase64 !== undefined) {
        logoPath = await saveFilialeImageFromBase64(instance.logoBase64, 'logoBase64');
      }
      if (instance.stampBase64 !== undefined) {
        stampPath = await saveFilialeImageFromBase64(instance.stampBase64, 'stampBase64');
      }
    } catch (err) {
      // Le logo a pu être écrit avec succès avant l'échec du cachet — on
      // nettoie ce fichier orphelin plutôt que de le laisser sur disque sans
      // jamais être référencé.
      if (logoPath) await deleteFilialeUpload(logoPath);
      result.errors.push({
        index,
        message: err instanceof Error ? err.message : 'Image invalide.',
      });
      continue;
    }

    // Ligne de commentaire du modèle CSV (« # Exemple 1 — … ») : ignorée en
    // silence plutôt que créée, au cas où le navigateur ne l'aurait pas filtrée.
    if (instance.name.startsWith('#')) {
      result.skipped += 1;
      continue;
    }

    const key = instance.name.toLowerCase();
    const found = byName.get(key);

    if (found) {
      const changes: FilialeChanges = {};
      if (instance.displayName !== undefined && instance.displayName !== found.displayName) {
        changes.displayName = instance.displayName;
      }
      if (instance.address !== undefined && instance.address !== (found.address ?? undefined)) {
        changes.address = instance.address;
      }
      if (instance.siret !== undefined && instance.siret !== (found.siret ?? undefined)) {
        changes.siret = instance.siret;
      }
      if (instance.active !== undefined && instance.active !== found.active) {
        changes.active = instance.active;
      }
      if (logoPath !== undefined) changes.logoPath = logoPath;
      if (stampPath !== undefined) changes.stampPath = stampPath;

      if (Object.keys(changes).length === 0) {
        result.skipped++;
        continue;
      }

      const replacedLogoPath = logoPath !== undefined ? found.logoPath : null;
      const replacedStampPath = stampPath !== undefined ? found.stampPath : null;

      await prisma.filiale.update({ where: { id: found.id }, data: changes });

      // Nettoyage best-effort de l'ancien fichier remplacé (même logique que
      // FilialesService#updateLogo/#updateStamp) — non bloquant.
      if (replacedLogoPath) await deleteFilialeUpload(replacedLogoPath);
      if (replacedStampPath) await deleteFilialeUpload(replacedStampPath);

      byName.set(key, { ...found, ...changes });
      result.updated++;
      continue;
    }

    const created = await prisma.filiale.create({
      data: {
        name: instance.name,
        displayName: instance.displayName ?? instance.name,
        address: instance.address,
        siret: instance.siret,
        active: instance.active ?? true,
        logoPath,
        stampPath,
      },
    });
    byName.set(key, {
      id: created.id,
      name: created.name,
      displayName: created.displayName,
      address: created.address,
      siret: created.siret,
      active: created.active,
      logoPath: created.logoPath,
      stampPath: created.stampPath,
    });
    result.created++;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'filiales_imported',
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
