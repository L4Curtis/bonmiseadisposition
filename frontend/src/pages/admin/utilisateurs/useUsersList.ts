import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { usePagination, type Pagination } from '@/hooks/usePagination';
import type { UserPageMeta, UserStatusFilter } from '@/contracts/users';
import type { UserRow } from './types';

const SEARCH_DEBOUNCE_MS = 300;

export interface UsersList {
  readonly users: readonly UserRow[];
  readonly total: number;
  readonly loading: boolean;
  readonly loadError: string | null;
  /** L'annuaire synchronise les comptes : un compte qui en vient se désactive
   *  alors dans Active Directory, pas ici. */
  readonly directoryActive: boolean;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly status: UserStatusFilter;
  readonly setStatus: (value: UserStatusFilter) => void;
  readonly hasActiveFilters: boolean;
  readonly clearFilters: () => void;
  readonly pagination: Pagination;
  readonly reload: () => void;
  /** Remplace un compte de la page affichée (mise à jour optimiste ou réponse
   *  du serveur), sans recharger la liste. */
  readonly replaceUser: (id: string, update: (user: UserRow) => UserRow) => void;
}

function usersPath(search: string, status: UserStatusFilter, page: number, limit: number): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
  if (search) params.set('search', search);
  return `/users?${params.toString()}`;
}

/**
 * Page de l'écran Utilisateurs (GET /users) : recherche sur le nom, l'email
 * ou l'identifiant, filtre d'état (actifs par défaut), pagination commune
 * (page dans l'adresse, 25, 50 ou 100 lignes). Une réponse arrivée après une
 * requête plus récente est ignorée.
 */
export function useUsersList(): UsersList {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [directoryActive, setDirectoryActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatusState] = useState<UserStatusFilter>('active');
  const [reloadKey, setReloadKey] = useState(0);
  const pagination = usePagination({ total });
  const { page, pageSize, setPage } = pagination;
  const requestId = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Une nouvelle recherche repart de la première page (pas au premier affichage,
  // pour garder la page d'un lien partagé).
  const previousSearch = useRef(search);
  useEffect(() => {
    if (previousSearch.current === search) return;
    previousSearch.current = search;
    setPage(1);
  }, [search, setPage]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    api
      .getList<UserRow, UserPageMeta>(usersPath(search, status, page, pageSize))
      .then((list) => {
        if (requestId.current !== id) return;
        setUsers(list.items);
        setTotal(list.total);
        setDirectoryActive(list.meta?.directoryActive ?? true);
      })
      .catch((e: unknown) => {
        if (requestId.current !== id) return;
        setUsers([]);
        setTotal(0);
        setLoadError(errorMessage(e, 'Erreur lors du chargement des utilisateurs'));
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [search, status, page, pageSize, reloadKey]);

  const setStatus = useCallback((value: UserStatusFilter) => {
    setStatusState(value);
    setPage(1);
  }, [setPage]);

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setStatusState('active');
    setPage(1);
  }, [setPage]);

  const replaceUser = useCallback((id: string, update: (user: UserRow) => UserRow) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? update(u) : u)));
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    users,
    total,
    loading,
    loadError,
    directoryActive,
    searchInput,
    setSearchInput,
    status,
    setStatus,
    hasActiveFilters: search !== '' || status !== 'active',
    clearFilters,
    pagination,
    reload,
    replaceUser,
  };
}
