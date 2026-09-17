import { describe, it, expect } from 'vitest';
import { buildAddItemPayload, buildRemoveItemPayload, buildUpdateQuantityPayload } from '../packItems';
import type { Pack } from '../../types';

const catalogItem = (id: string) => ({
  id, category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook', active: true,
});

const items: Pack['items'] = [
  { id: 'pi-1', catalogItem: catalogItem('c1'), quantity: 2, order: 0 },
  { id: 'pi-2', catalogItem: catalogItem('c2'), quantity: 1, order: 1 },
];

describe('buildAddItemPayload', () => {
  it('ajoute le nouvel equipement en fin de liste, en conservant les positions existantes', () => {
    expect(buildAddItemPayload(items, 'c3', 3)).toEqual([
      { catalogItemId: 'c1', quantity: 2, order: 0 },
      { catalogItemId: 'c2', quantity: 1, order: 1 },
      { catalogItemId: 'c3', quantity: 3, order: 2 },
    ]);
  });

  it('fonctionne sur une liste vide', () => {
    expect(buildAddItemPayload([], 'c1', 1)).toEqual([{ catalogItemId: 'c1', quantity: 1, order: 0 }]);
  });
});

describe('buildRemoveItemPayload', () => {
  it("retire l'equipement cible et renumerote les positions restantes", () => {
    expect(buildRemoveItemPayload(items, 'c1')).toEqual([
      { catalogItemId: 'c2', quantity: 1, order: 0 },
    ]);
  });

  it('ne modifie rien si l\'equipement cible est absent', () => {
    expect(buildRemoveItemPayload(items, 'unknown')).toEqual([
      { catalogItemId: 'c1', quantity: 2, order: 0 },
      { catalogItemId: 'c2', quantity: 1, order: 1 },
    ]);
  });
});

describe('buildUpdateQuantityPayload', () => {
  it("met a jour la quantite de l'equipement cible sans toucher aux autres ni a l'ordre", () => {
    expect(buildUpdateQuantityPayload(items, 'c2', 5)).toEqual([
      { catalogItemId: 'c1', quantity: 2, order: 0 },
      { catalogItemId: 'c2', quantity: 5, order: 1 },
    ]);
  });
});
