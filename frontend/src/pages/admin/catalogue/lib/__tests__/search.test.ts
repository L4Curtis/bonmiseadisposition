import { describe, it, expect } from 'vitest';
import { filterActiveCatalogItems } from '../search';
import type { CatalogItem } from '../../types';

const CATEGORY_LABELS: Record<string, string> = { pc_portable: 'PC Portable', ecran: 'Ecran' };

function item(overrides: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'i1', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true, ...overrides,
  };
}

describe('filterActiveCatalogItems', () => {
  it('exclut les equipements inactifs', () => {
    const items = [item({ id: 'a', active: true }), item({ id: 'b', active: false })];
    const result = filterActiveCatalogItems(items, '', CATEGORY_LABELS);
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('filtre par marque, modele, description ou categorie (insensible a la casse)', () => {
    const items = [
      item({ id: 'a', brand: 'Lenovo', model: 'ThinkBook' }),
      item({ id: 'b', brand: 'Dell', model: 'Latitude', description: 'Ecran 24"' }),
      item({ id: 'c', brand: 'Apple', model: 'MacBook', category: 'ecran' }),
    ];

    expect(filterActiveCatalogItems(items, 'lenovo', CATEGORY_LABELS).map((r) => r.id)).toEqual(['a']);
    expect(filterActiveCatalogItems(items, 'ecran', CATEGORY_LABELS).map((r) => r.id).sort()).toEqual(['b', 'c']);
  });

  it('limite le resultat a 15 elements', () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ id: `id-${i}` }));
    expect(filterActiveCatalogItems(items, '', CATEGORY_LABELS)).toHaveLength(15);
  });
});
