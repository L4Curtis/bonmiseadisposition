import { describe, it, expect } from 'vitest';
import { filterAndSortCatalogItems } from '../search';
import type { CatalogItem } from '../../types';

const CATEGORY_LABELS: Record<string, string> = { pc_portable: 'PC Portable', ecran: 'Ecran' };

function item(overrides: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'i1', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true, ...overrides,
  };
}

describe('filterAndSortCatalogItems', () => {
  const items = [
    item({
      id: 'a', brand: 'Dell', model: 'Latitude', category: 'ecran', active: false,
    }),
    item({
      id: 'b', brand: 'Apple', model: 'MacBook', category: 'pc_portable', active: true,
    }),
    item({
      id: 'c', brand: 'Lenovo', model: 'ThinkPad', category: 'pc_portable', active: true,
    }),
  ];

  it('inclut les equipements desactives quand le filtre d\'etat est "all" (contrairement a filterActiveCatalogItems)', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'all', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(result.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('filtre par categorie', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: 'ecran', status: 'all', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('filtre par recherche texte (marque)', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: 'lenovo', category: '', status: 'all', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(result.map((r) => r.id)).toEqual(['c']);
  });

  it('trie par marque ascendant puis descendant', () => {
    const asc = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'all', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(asc.map((r) => r.brand)).toEqual(['Apple', 'Dell', 'Lenovo']);

    const desc = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'all', sortKey: 'brand', sortDirection: 'desc',
    });
    expect(desc.map((r) => r.brand)).toEqual(['Lenovo', 'Dell', 'Apple']);
  });

  it('trie par statut (actifs avant desactives en ordre ascendant)', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'all', sortKey: 'status', sortDirection: 'asc',
    });
    expect(result[0].active).toBe(true);
    expect(result[result.length - 1].active).toBe(false);
  });

  it('filtre par etat "active" : masque les equipements desactives par defaut', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'active', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(result.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });

  it('filtre par etat "inactive" : ne montre que les equipements desactives', () => {
    const result = filterAndSortCatalogItems(items, CATEGORY_LABELS, {
      search: '', category: '', status: 'inactive', sortKey: 'brand', sortDirection: 'asc',
    });
    expect(result.map((r) => r.id)).toEqual(['a']);
  });
});
