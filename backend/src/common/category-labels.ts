import { EquipmentCategory } from '@prisma/client';

/** Libellé affiché de chaque catégorie d'article du catalogue (inventaire,
 *  indicateurs de parc, exports). */
export const CATEGORY_LABELS: Readonly<Record<EquipmentCategory, string>> = Object.freeze({
  pc_portable: 'PC portable',
  pc_fixe: 'PC fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Station d’accueil',
  cable: 'Câble',
  autre: 'Autre',
});

/** Libellé d'une catégorie, ou la valeur brute si elle est inconnue (jamais
 *  une propriété héritée comme `constructor`). */
export function categoryLabel(category: string): string {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)
    ? CATEGORY_LABELS[category as EquipmentCategory]
    : category;
}
