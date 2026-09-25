import { describe, it, expect } from 'vitest';
import { act } from '@testing-library/react';
import { useSort, type SortOptions } from '../useSort';
import { paramsOf, renderUrlHook } from '@/test/url-hook';

type Field = 'reference' | 'createdAt' | 'collaborateur';

const OPTIONS: SortOptions<Field> = {
  fields: ['reference', 'createdAt', 'collaborateur'],
  defaultField: 'createdAt',
  defaultOrder: 'desc',
  firstClickOrder: { createdAt: 'desc' },
};

describe('useSort', () => {
  it('tri par défaut quand l’adresse n’en porte pas', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS));
    expect(result.current.value.field).toBe('createdAt');
    expect(result.current.value.order).toBe('desc');
  });

  it('lit un tri valide de l’adresse, ignore un champ inconnu', () => {
    const ok = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=reference&order=asc');
    expect(ok.result.current.value.field).toBe('reference');
    expect(ok.result.current.value.order).toBe('asc');

    const bad = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=motdepasse&order=up');
    expect(bad.result.current.value.field).toBe('createdAt');
    expect(bad.result.current.value.order).toBe('desc');
  });

  it('premier clic sur une colonne : ordre alphabétique (ou celui prévu), et retour page 1', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS), '/liste?page=3');
    act(() => result.current.value.toggleSort('collaborateur'));
    expect(paramsOf(result.current.location)).toEqual({ sort: 'collaborateur', order: 'asc' });
  });

  it('second clic sur la même colonne : inverse le sens', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=reference&order=asc');
    act(() => result.current.value.toggleSort('reference'));
    expect(result.current.value.order).toBe('desc');
  });

  it('revenir au tri par défaut retire le tri de l’adresse', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=reference&order=asc');
    act(() => result.current.value.toggleSort('createdAt'));
    expect(result.current.location.search).toBe('');
  });

  it('aria-sort pour les en-têtes de colonne', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=reference&order=asc');
    expect(result.current.value.ariaSort('reference')).toBe('ascending');
    expect(result.current.value.ariaSort('createdAt')).toBe('none');
  });

  it('reposer le tri déjà actif ne ramène pas à la page 1', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS), '/liste?sort=reference&order=asc&page=2');
    act(() => result.current.value.setSort('reference', 'asc'));
    expect(paramsOf(result.current.location)).toEqual({ sort: 'reference', order: 'asc', page: '2' });
  });

  it('setSort impose un tri précis', () => {
    const { result } = renderUrlHook(() => useSort(OPTIONS));
    act(() => result.current.value.setSort('reference', 'desc'));
    expect(paramsOf(result.current.location)).toEqual({ sort: 'reference', order: 'desc' });
  });
});
