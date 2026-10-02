import { describe, it, expect } from 'vitest';
import { DEFAULT_LIST_QUERY } from '../bonsListQuery';
import {
  ignoredFiltersNotice,
  invertedRanges,
  isRealDay,
  readListQuery,
  withoutInvertedRanges,
} from '../readListQuery';

const read = (qs: string) => readListQuery(new URLSearchParams(qs));
const FILIALE_ID = '0b7e3c6a-2f43-4a51-9d3e-6f1c2a9b8e10';

describe('isRealDay', () => {
  it.each([
    ['2026-10-02', true],
    ['2028-02-29', true],
    ['2026-13-45', false],
    ['2026-02-30', false],
    ['2026-00-10', false],
    ['02/10/2026', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isRealDay(value)).toBe(expected);
  });
});

describe('readListQuery — valeurs invalides ignorées et signalées', () => {
  it('une adresse saine ne signale rien', () => {
    const { query, ignored } = read(`dateFrom=2026-01-01&dateTo=2026-01-31&status=draft&filialeId=${FILIALE_ID}`);
    expect(ignored).toEqual([]);
    expect(query).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-01-31', status: 'draft', filialeId: FILIALE_ID });
  });

  it('ignore une date qui n’existe pas (13e mois, 45e jour) et la nomme sans nom technique', () => {
    const { query, ignored } = read('dateFrom=2026-13-45');
    expect(query.dateFrom).toBe('');
    expect(ignored).toEqual(['date de début de mise à disposition']);
  });

  it('valide aussi les périodes de création, de clôture et d’annulation', () => {
    const { query, ignored } = read('createdFrom=2026-02-30&closedTo=2026-99-01&cancelledFrom=hier');
    expect(query).toMatchObject({ createdFrom: '', closedTo: '', cancelledFrom: '' });
    expect(ignored).toEqual(['date de début de création', 'date de fin de clôture', 'date de début d’annulation']);
  });

  it('ignore une période inversée venue de l’adresse (début après la fin)', () => {
    const { query, ignored } = read('dateFrom=2026-03-31&dateTo=2026-01-01&createdFrom=2026-09-02&createdTo=2026-09-01');
    expect(query).toMatchObject({ dateFrom: '', dateTo: '', createdFrom: '', createdTo: '' });
    expect(ignored).toEqual([
      'période de mise à disposition (début après la fin)',
      'période de création (début après la fin)',
    ]);
  });

  it('garde les statuts connus, écarte les autres', () => {
    expect(read('status=draft,inconnu')).toEqual({
      query: { ...DEFAULT_LIST_QUERY, status: 'draft' },
      ignored: ['statut'],
    });
    expect(read('excludeStatus=zzz').query.excludeStatus).toBe('');
    expect(read('status=sent_mise_dispo,sent_restitution,partially_returned').ignored).toEqual([]);
  });

  it('ignore une filiale, un créateur, une étape ou une référence mal formés', () => {
    const { query, ignored } = read('filialeId=f1&createdById=moi&subStatus=nimporte&reference=0042');
    expect(query).toMatchObject({ filialeId: '', createdById: '', subStatus: '', reference: '' });
    expect(ignored).toEqual(['référence du bon', 'filiale', 'étape de la restitution', 'créateur du bon']);
  });

  it('ignore une recherche trop longue pour le serveur (plus de 200 caractères)', () => {
    const { query, ignored } = read(`search=${'a'.repeat(201)}`);
    expect(query.search).toBe('');
    expect(ignored).toEqual(['recherche']);
  });

  it('signale un tri inconnu ; une page invalide revient simplement à la première', () => {
    const { query, ignored } = read('sort=notes&order=up&page=-2');
    expect(query).toMatchObject({ sort: 'createdAt', order: 'desc', page: 1 });
    expect(ignored).toEqual(['tri', 'sens du tri']);
  });
});

describe('invertedRanges / withoutInvertedRanges', () => {
  it('repère une période dont le début suit la fin et la retire de la requête', () => {
    const q = { ...DEFAULT_LIST_QUERY, dateFrom: '2026-05-01', dateTo: '2026-04-01', closedFrom: '2026-01-01' };
    expect(invertedRanges(q)).toEqual(['mise']);
    expect(withoutInvertedRanges(q)).toEqual({ ...q, dateFrom: '', dateTo: '' });
  });

  it('une période d’un seul jour ou ouverte n’est pas inversée', () => {
    const q = { ...DEFAULT_LIST_QUERY, dateFrom: '2026-05-01', dateTo: '2026-05-01', createdTo: '2026-01-01' };
    expect(invertedRanges(q)).toEqual([]);
    expect(withoutInvertedRanges(q)).toBe(q);
  });
});

describe('ignoredFiltersNotice', () => {
  it('rien d’ignoré : pas de message', () => {
    expect(ignoredFiltersNotice([])).toBeNull();
  });

  it('un filtre : phrase au singulier', () => {
    expect(ignoredFiltersNotice(['date de début de mise à disposition']))
      .toBe('Un filtre n’était pas valide et a été ignoré : date de début de mise à disposition.');
  });

  it('plusieurs filtres : phrase au pluriel', () => {
    expect(ignoredFiltersNotice(['statut', 'filiale']))
      .toBe('Des filtres n’étaient pas valides et ont été ignorés : statut, filiale.');
  });
});
