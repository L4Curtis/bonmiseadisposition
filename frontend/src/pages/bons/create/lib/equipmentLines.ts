import { newLine } from '../types';
import type { EquipmentLine } from '../types';

export const MIN_CATALOG_QUANTITY = 1;
export const MAX_CATALOG_QUANTITY = 50;

/** Ramène une quantité saisie à un entier valide dans les bornes autorisées
 *  (au moins une unité, au plus MAX_CATALOG_QUANTITY pour éviter une saisie
 *  erronée qui créerait des milliers de lignes). */
export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_CATALOG_QUANTITY;
  return Math.min(MAX_CATALOG_QUANTITY, Math.max(MIN_CATALOG_QUANTITY, Math.floor(value)));
}

/** Duplique une ligne d'équipement : même article (catalogue ou libellé
 *  personnalisé), numéro de série et numéro d'inventaire vides — propres à
 *  chaque unité physique, ils ne doivent jamais être recopiés. Insère la
 *  copie juste après la ligne source. */
export function duplicateLine(lines: readonly EquipmentLine[], id: string): EquipmentLine[] {
  const index = lines.findIndex((line) => line._id === id);
  if (index === -1) return [...lines];
  const source = lines[index];
  const copy = newLine({
    catalogItemId: source.catalogItemId,
    catalogItemLabel: source.catalogItemLabel,
    customLabel: source.customLabel,
  });
  return [...lines.slice(0, index + 1), copy, ...lines.slice(index + 1)];
}

/** Découpe un texte collé (typiquement copié depuis Excel) en valeurs
 *  individuelles : retours à la ligne ET tabulations sont traités comme des
 *  séparateurs, pour couvrir aussi bien une colonne qu'une ligne de cellules. */
export function splitPastedSerials(text: string): string[] {
  return text
    .split(/[\r\n\t]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Répartit une valeur par ligne d'équipement à partir de la ligne `startId` :
 *  écrase le numéro de série des lignes déjà présentes à partir de là, et crée
 *  les lignes manquantes (même article que la ligne de départ) pour les
 *  valeurs excédentaires — sans jamais toucher aux lignes précédentes. */
export function distributeSerialsFromLine(
  lines: readonly EquipmentLine[],
  startId: string,
  values: readonly string[],
): EquipmentLine[] {
  const startIndex = lines.findIndex((line) => line._id === startId);
  if (startIndex === -1 || values.length === 0) return [...lines];
  const source = lines[startIndex];
  const result = [...lines];
  values.forEach((value, offset) => {
    const targetIndex = startIndex + offset;
    if (targetIndex < result.length) {
      result[targetIndex] = { ...result[targetIndex], serialNumber: value };
    } else {
      result.push(
        newLine({
          catalogItemId: source.catalogItemId,
          catalogItemLabel: source.catalogItemLabel,
          customLabel: source.customLabel,
          serialNumber: value,
        }),
      );
    }
  });
  return result;
}

/** Identifie les lignes dont le numéro de série est dupliqué DANS le
 *  formulaire courant (même normalisation — trim + casse insensible — que la
 *  validation de soumission dans `@/lib/validation`), pour signaler le
 *  problème pendant la saisie plutôt qu'à la validation finale. */
export function findDuplicateSerialIds(lines: readonly EquipmentLine[]): ReadonlySet<string> {
  const idsByKey = new Map<string, string[]>();
  for (const line of lines) {
    const raw = line.serialNumber?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const ids = idsByKey.get(key) ?? [];
    ids.push(line._id);
    idsByKey.set(key, ids);
  }
  const duplicates = new Set<string>();
  for (const ids of idsByKey.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicates.add(id));
  }
  return duplicates;
}
