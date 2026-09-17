import { describe, it, expect } from 'vitest';
import { validateCatalogItemForm } from '../validation';

describe('validateCatalogItemForm', () => {
  it('retourne null quand la marque et le modele sont renseignes', () => {
    expect(validateCatalogItemForm({ brand: 'Lenovo', model: 'ThinkBook 16 G6' })).toBeNull();
  });

  it("retourne un message d'erreur quand la marque est vide", () => {
    expect(validateCatalogItemForm({ brand: '  ', model: 'ThinkBook' }))
      .toBe('La marque et le modèle sont obligatoires');
  });

  it("retourne un message d'erreur quand le modele est vide", () => {
    expect(validateCatalogItemForm({ brand: 'Lenovo', model: '' }))
      .toBe('La marque et le modèle sont obligatoires');
  });
});
