import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIST_QUERY,
  hasActiveFilters,
  nextSort,
  parseListQuery,
  toApiParams,
  toExportParams,
  toRememberedParams,
  toUrlParams,
} from '../bonsListQuery';

const parse = (qs: string) => parseListQuery(new URLSearchParams(qs));

describe('parseListQuery', () => {
  it('renvoie l’état par défaut pour une URL vide', () => {
    expect(parse('')).toEqual(DEFAULT_LIST_QUERY);
  });

  it('lit filtres, tri et page', () => {
    expect(parse('search=jean&status=draft&overdue=1&dateFrom=2026-01-01&dateTo=2026-01-31&noReturnDate=1&createdById=u1&sort=reference&order=asc&page=3'))
      .toEqual({
        ...DEFAULT_LIST_QUERY,
        search: 'jean', status: 'draft', overdue: true, dateFrom: '2026-01-01', dateTo: '2026-01-31',
        noReturnDate: true, createdById: 'u1', sort: 'reference', order: 'asc', page: 3,
      });
  });

  it('retombe sur les valeurs par défaut pour un tri, une date ou une page invalides', () => {
    const q = parse('sort=notes&order=up&dateFrom=01/02/2026&page=-2');
    expect(q.sort).toBe('createdAt');
    expect(q.order).toBe('desc');
    expect(q.dateFrom).toBe('');
    expect(q.page).toBe(1);
  });

  it('accepte overdue=true (liens existants du tableau de bord)', () => {
    expect(parse('overdue=true').overdue).toBe(true);
  });
});

describe('toUrlParams', () => {
  it('omet les valeurs par défaut', () => {
    expect(toUrlParams(DEFAULT_LIST_QUERY).toString()).toBe('');
  });

  it('fait l’aller-retour avec parseListQuery', () => {
    const q = { ...DEFAULT_LIST_QUERY, search: 'a b', status: 'draft,active', sort: 'updatedAt' as const, order: 'asc' as const, page: 2 };
    expect(parseListQuery(toUrlParams(q))).toEqual(q);
  });
});

describe('toRememberedParams', () => {
  it('mémorise filtres et tri, jamais la page', () => {
    const q = { ...DEFAULT_LIST_QUERY, status: 'draft', sort: 'reference' as const, order: 'asc' as const, page: 4 };
    expect(toRememberedParams(q).toString()).toBe('status=draft&sort=reference&order=asc');
  });
});

describe('toApiParams / toExportParams', () => {
  it('envoie toujours tri, page et limite à l’API', () => {
    const params = toApiParams({ ...DEFAULT_LIST_QUERY, overdue: true }, 20);
    expect(params.get('overdue')).toBe('1');
    expect(params.get('sort')).toBe('createdAt');
    expect(params.get('order')).toBe('desc');
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('20');
  });

  it('exporte les filtres et le tri courants, sans pagination', () => {
    const params = toExportParams({ ...DEFAULT_LIST_QUERY, search: 'x', page: 3, sort: 'status', order: 'asc' });
    expect(params.toString()).toBe('search=x&sort=status&order=asc');
  });

  it('exporte la seule sélection quand des ids sont fournis (filtres ignorés)', () => {
    const params = toExportParams({ ...DEFAULT_LIST_QUERY, search: 'x' }, ['a', 'b']);
    expect(params.get('ids')).toBe('a,b');
    expect(params.has('search')).toBe(false);
    expect(params.get('sort')).toBe('createdAt');
  });
});

describe('hasActiveFilters', () => {
  it('ne compte pas le tri ni la page comme des filtres', () => {
    expect(hasActiveFilters({ ...DEFAULT_LIST_QUERY, sort: 'reference', page: 2 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIST_QUERY, noReturnDate: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIST_QUERY, dateTo: '2026-01-01' })).toBe(true);
  });
});

describe('nextSort', () => {
  it('inverse le sens sur la colonne déjà triée', () => {
    expect(nextSort(DEFAULT_LIST_QUERY, 'createdAt')).toEqual({ sort: 'createdAt', order: 'asc' });
  });

  it('applique le sens naturel d’une nouvelle colonne', () => {
    expect(nextSort(DEFAULT_LIST_QUERY, 'collaborateur')).toEqual({ sort: 'collaborateur', order: 'asc' });
    expect(nextSort(DEFAULT_LIST_QUERY, 'updatedAt')).toEqual({ sort: 'updatedAt', order: 'desc' });
  });
});
