/**
 * Plafond de lignes de l'export CSV de l'inventaire.
 *
 * 10 000 lignes couvrent largement le parc réel (quelques milliers
 * d'équipements). La variable d'environnement `INVENTORY_EXPORT_ROW_LIMIT`
 * peut seulement l'**abaisser** : elle sert à vérifier, en recette ou en
 * test, l'avertissement affiché avant un export trop gros et le bandeau
 * affiché après un fichier coupé, sans créer dix mille équipements. Une
 * valeur illisible, nulle ou supérieure au plafond est ignorée.
 */

export const DEFAULT_EXPORT_ROW_LIMIT = 10000;

export const INVENTORY_EXPORT_LIMIT_ENV = 'INVENTORY_EXPORT_ROW_LIMIT';

const POSITIVE_INTEGER = /^\d+$/;

/** Plafond appliqué, relu à chaque export (aucun redémarrage nécessaire en test). */
export function inventoryExportRowLimit(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env[INVENTORY_EXPORT_LIMIT_ENV]?.trim() ?? '';
  if (!POSITIVE_INTEGER.test(raw)) return DEFAULT_EXPORT_ROW_LIMIT;
  const value = Number(raw);
  return value >= 1 && value <= DEFAULT_EXPORT_ROW_LIMIT ? value : DEFAULT_EXPORT_ROW_LIMIT;
}
