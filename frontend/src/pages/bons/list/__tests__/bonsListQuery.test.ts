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
    const params = toApiParams({ ...DEFAULT_LIST_QUERY, overdue: true }, 50);
    expect(params.get('overdue')).toBe('1');
    expect(params.get('sort')).toBe('createdAt');
    expect(params.get('order')).toBe('desc');
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('50');
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

describe('filtres des tuiles de l’accueil (tuile = liste)', () => {
  it('lit et transmet awaitingSignature et linkExpired à l’API', async () => {
    const { parseListQuery: parse, toApiParams: api, hasActiveFilters: active } = await import('../bonsListQuery');
    const q = parse(new URLSearchParams('awaitingSignature=1&linkExpired=1'));
    expect(q).toMatchObject({ awaitingSignature: true, linkExpired: true });
    const params = api(q, 25);
    expect(params.get('awaitingSignature')).toBe('1');
    expect(params.get('linkExpired')).toBe('1');
    expect(active(q)).toBe(true);
  });
});

describe('filtre par sous-état (section « Restitution partielle à signer » de l’accueil)', () => {
  it('lit un sous-état connu et le transmet ; ignore une valeur inconnue', async () => {
    const { parseListQuery: parse, toApiParams: api } = await import('../bonsListQuery');
    const q = parse(new URLSearchParams('subStatus=partial_restitution_to_sign'));
    expect(api(q, 25).get('subStatus')).toBe('partial_restitution_to_sign');
    expect(parse(new URLSearchParams('subStatus=nimporte')).subStatus).toBe('');
  });
});

describe('référence exacte et périodes d’événement (liens du tableau de bord)', () => {
  it('lit la référence (en majuscules) et ignore un texte qui n’en est pas une', () => {
    expect(parse('reference=bon-2026-0042').reference).toBe('BON-2026-0042');
    expect(parse('reference=0042').reference).toBe('');
  });

  it('lit les périodes de création, de clôture et d’annulation ; une date mal formée est ignorée', () => {
    const q = parse('createdFrom=2026-09-01&createdTo=2026-09-30&closedFrom=2026-09-02&cancelledTo=2026-09-03&closedTo=30/09/2026');
    expect(q).toMatchObject({
      createdFrom: '2026-09-01', createdTo: '2026-09-30', closedFrom: '2026-09-02', closedTo: '', cancelledTo: '2026-09-03',
    });
  });

  it('les garde dans l’adresse, les envoie à l’API et à l’export, et les compte comme filtres actifs', () => {
    const q = { ...DEFAULT_LIST_QUERY, reference: 'BON-2026-0042', closedFrom: '2026-09-01', closedTo: '2026-09-30' };
    expect(toUrlParams(q).toString()).toBe('reference=BON-2026-0042&closedFrom=2026-09-01&closedTo=2026-09-30');
    expect(toApiParams(q, 25).get('closedFrom')).toBe('2026-09-01');
    expect(toExportParams(q).get('reference')).toBe('BON-2026-0042');
    expect(hasActiveFilters(q)).toBe(true);
  });
});
