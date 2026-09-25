import { EquipmentCategory } from '@prisma/client';
import { CATEGORY_LABELS, categoryLabel } from '../category-labels';

describe('libellés des catégories d’équipement', () => {
  it('chaque catégorie de la base a un libellé', () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(Object.values(EquipmentCategory).sort());
    expect(CATEGORY_LABELS.pc_portable).toBe('PC portable');
    expect(CATEGORY_LABELS.ecran).toBe('Écran');
    expect(CATEGORY_LABELS.dock).toBe('Station d’accueil');
  });

  it('categoryLabel renvoie la valeur brute d’une catégorie inconnue', () => {
    expect(categoryLabel('autre')).toBe('Autre');
    expect(categoryLabel('imprimante')).toBe('imprimante');
    expect(categoryLabel('constructor')).toBe('constructor');
  });

  it('la table est figée', () => {
    expect(Object.isFrozen(CATEGORY_LABELS)).toBe(true);
  });
});
