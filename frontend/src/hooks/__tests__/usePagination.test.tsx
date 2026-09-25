import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act } from '@testing-library/react';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_STORAGE_KEY,
  usePagination,
} from '../usePagination';
import { paramsOf, renderUrlHook } from '@/test/url-hook';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePagination — page dans l’adresse', () => {
  it('page 1 et 25 lignes par défaut', () => {
    const { result } = renderUrlHook(() => usePagination());
    expect(result.current.value.page).toBe(1);
    expect(result.current.value.pageSize).toBe(25);
    expect(DEFAULT_PAGE_SIZE).toBe(25);
    expect(PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
  });

  it('lit la page d’un lien partagé', () => {
    const { result } = renderUrlHook(() => usePagination(), '/liste?page=3');
    expect(result.current.value.page).toBe(3);
    expect(result.current.value.offset).toBe(50);
  });

  it.each(['0', '-2', 'abc', '1.5'])('page=%s invalide → page 1', (raw) => {
    const { result } = renderUrlHook(() => usePagination(), `/liste?page=${raw}`);
    expect(result.current.value.page).toBe(1);
  });

  it('setPage écrit la page, et la page 1 n’apparaît pas dans l’adresse', () => {
    const { result } = renderUrlHook(() => usePagination(), '/liste?search=x');
    act(() => result.current.value.setPage(2));
    expect(paramsOf(result.current.location)).toEqual({ search: 'x', page: '2' });
    act(() => result.current.value.setPage(1));
    expect(paramsOf(result.current.location)).toEqual({ search: 'x' });
  });

  it('calcule les bornes affichées « 26–50 sur 132 »', () => {
    const { result } = renderUrlHook(() => usePagination({ total: 132 }), '/liste?page=2');
    expect(result.current.value.totalPages).toBe(6);
    expect(result.current.value.rangeStart).toBe(26);
    expect(result.current.value.rangeEnd).toBe(50);
  });

  it('liste vide : 0–0 et une seule page', () => {
    const { result } = renderUrlHook(() => usePagination({ total: 0 }));
    expect(result.current.value.rangeStart).toBe(0);
    expect(result.current.value.rangeEnd).toBe(0);
    expect(result.current.value.totalPages).toBe(1);
  });

  it('ramène sur la dernière page quand la page demandée n’existe plus', () => {
    const { result } = renderUrlHook(() => usePagination({ total: 30 }), '/liste?page=9');
    expect(result.current.value.page).toBe(2);
    expect(paramsOf(result.current.location)).toEqual({ page: '2' });
  });
});

describe('usePagination — taille choisie par l’utilisateur', () => {
  it('mémorise le choix dans le navigateur et revient à la page 1', () => {
    const { result } = renderUrlHook(() => usePagination(), '/liste?page=4');
    act(() => result.current.value.setPageSize(100));
    expect(result.current.value.pageSize).toBe(100);
    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe('100');
    expect(result.current.location.search).toBe('');
  });

  it('reprend la taille mémorisée au prochain affichage', () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '50');
    const { result } = renderUrlHook(() => usePagination());
    expect(result.current.value.pageSize).toBe(50);
  });

  it('ignore une taille mémorisée hors choix (valeur modifiée à la main)', () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '5000');
    const { result } = renderUrlHook(() => usePagination());
    expect(result.current.value.pageSize).toBe(25);
  });

  it('une clé propre à la liste isole son choix', () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '50');
    localStorage.setItem('journal', '100');
    const { result } = renderUrlHook(() => usePagination({ storageKey: 'journal' }));
    expect(result.current.value.pageSize).toBe(100);
  });

  it('fonctionne sans stockage (navigation privée, stockage bloqué)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqué', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqué', 'SecurityError');
    });
    const { result } = renderUrlHook(() => usePagination());
    expect(result.current.value.pageSize).toBe(25);
    act(() => result.current.value.setPageSize(50));
    expect(result.current.value.pageSize).toBe(50);
  });
});
