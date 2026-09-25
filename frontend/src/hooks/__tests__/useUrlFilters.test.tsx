import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { filterField, useUrlFilters } from '../useUrlFilters';
import { usePagination } from '../usePagination';
import { paramsOf, renderUrlHook } from '@/test/url-hook';

const SCHEMA = {
  search: filterField.text(),
  status: filterField.oneOf(['open', 'closed'] as const),
  overdue: filterField.flag(),
  from: filterField.day(),
};

describe('useUrlFilters — lecture de l’adresse', () => {
  it('valeurs par défaut quand l’adresse est vide', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA));
    expect(result.current.value.filters).toEqual({ search: '', status: '', overdue: false, from: '' });
    expect(result.current.value.hasActiveFilters).toBe(false);
    expect(result.current.value.activeFilterCount).toBe(0);
  });

  it('lit et type les valeurs d’un lien partagé', () => {
    const { result } = renderUrlHook(
      () => useUrlFilters(SCHEMA),
      '/liste?search=Dupont&status=open&overdue=1&from=2026-09-01',
    );
    expect(result.current.value.filters).toEqual({
      search: 'Dupont', status: 'open', overdue: true, from: '2026-09-01',
    });
    expect(result.current.value.activeFilterCount).toBe(4);
  });

  it('ignore une valeur invalide (lien trafiqué ou ancien) et garde la valeur par défaut', () => {
    const { result } = renderUrlHook(
      () => useUrlFilters(SCHEMA),
      '/liste?status=supprime&overdue=peut-etre&from=01/09/2026',
    );
    expect(result.current.value.filters).toEqual({ search: '', status: '', overdue: false, from: '' });
  });

  it('accepte « true » pour un interrupteur (anciens liens)', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA), '/liste?overdue=true');
    expect(result.current.value.filters.overdue).toBe(true);
  });
});

describe('useUrlFilters — écriture dans l’adresse', () => {
  it('écrit le filtre et revient à la page 1', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA), '/liste?page=3&autre=x');
    act(() => result.current.value.setFilter('status', 'closed'));
    expect(paramsOf(result.current.location)).toEqual({ status: 'closed', autre: 'x' });
    expect(result.current.value.filters.status).toBe('closed');
  });

  it('réécrire la même valeur ne ramène pas à la page 1 (recherche différée au chargement d’un lien)', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA), '/liste?search=PC&page=3');
    act(() => result.current.value.setFilter('search', 'PC'));
    act(() => result.current.value.setFilters({ status: '', overdue: false }));
    expect(paramsOf(result.current.location)).toEqual({ search: 'PC', page: '3' });
  });

  it('une valeur par défaut disparaît de l’adresse (liens courts)', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA), '/liste?overdue=1&search=a');
    act(() => result.current.value.setFilter('overdue', false));
    act(() => result.current.value.setFilter('search', ''));
    expect(result.current.location.search).toBe('');
  });

  it('deux écritures dans le même geste sont toutes deux conservées', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA));
    act(() => {
      result.current.value.setFilter('status', 'open');
      result.current.value.setFilter('search', 'PC');
    });
    expect(paramsOf(result.current.location)).toEqual({ status: 'open', search: 'PC' });
  });

  it('setFilters change plusieurs filtres d’un coup', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA));
    act(() => result.current.value.setFilters({ status: 'open', overdue: true }));
    expect(paramsOf(result.current.location)).toEqual({ status: 'open', overdue: '1' });
  });

  it('resetFilters efface les filtres du schéma et la page, garde le reste de l’adresse', () => {
    const { result } = renderUrlHook(
      () => useUrlFilters(SCHEMA),
      '/liste?search=a&status=open&page=2&sort=reference',
    );
    act(() => result.current.value.resetFilters());
    expect(paramsOf(result.current.location)).toEqual({ sort: 'reference' });
  });

  it('remplace l’entrée d’historique : « retour » quitte la liste au lieu de rejouer chaque frappe', () => {
    const { result } = renderUrlHook(() => useUrlFilters(SCHEMA));
    act(() => result.current.value.setFilter('search', 'a'));
    expect(result.current.navigationType).toBe('REPLACE');
    expect(result.current.location.pathname).toBe('/liste');
  });

  it('se combine avec la pagination sans perte : filtre puis page dans le même geste', () => {
    const { result } = renderUrlHook(() => ({
      filters: useUrlFilters(SCHEMA),
      pagination: usePagination(),
    }), '/liste?page=4');
    act(() => {
      result.current.value.filters.setFilter('status', 'open');
      result.current.value.pagination.setPage(2);
    });
    expect(paramsOf(result.current.location)).toEqual({ status: 'open', page: '2' });
  });
});
