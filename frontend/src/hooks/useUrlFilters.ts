import { useCallback, useMemo } from 'react';
import { useSearchParamsPatch, type SearchParamsPatch } from './useSearchParamsPatch';

/**
 * Un filtre de liste gardé dans l'adresse : sa valeur par défaut, sa lecture
 * (une valeur invalide redevient la valeur par défaut, jamais une erreur) et
 * son écriture (`null` = absent de l'adresse).
 */
export interface FilterField<T> {
  readonly defaultValue: T;
  parse(raw: string | null): T;
  serialize(value: T): string | null;
}

/** Schéma d'une liste : nom du paramètre d'adresse → type de filtre. */
export type FilterSchema = Readonly<Record<string, FilterField<unknown>>>;

/** Valeurs typées d'un schéma (`{ search: string; overdue: boolean; … }`). */
export type FilterValues<S extends FilterSchema> = {
  readonly [K in keyof S]: S[K] extends FilterField<infer T> ? T : never;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Types de filtre courants. Le schéma se déclare une fois, hors du composant. */
export const filterField = {
  /** Texte libre (recherche, identifiant). Vide = pas de filtre. */
  text(): FilterField<string> {
    return {
      defaultValue: '',
      parse: (raw) => raw ?? '',
      serialize: (value) => value || null,
    };
  },
  /** Une valeur parmi une liste fermée (statut, vue). Hors liste = pas de filtre. */
  oneOf<V extends string>(values: readonly V[]): FilterField<V | ''> {
    return {
      defaultValue: '',
      parse: (raw) => (raw !== null && (values as readonly string[]).includes(raw) ? (raw as V) : ''),
      serialize: (value) => value || null,
    };
  },
  /** Interrupteur (« en retard seulement ») : `1` dans l'adresse ; `true` accepté. */
  flag(): FilterField<boolean> {
    return {
      defaultValue: false,
      parse: (raw) => raw === '1' || raw === 'true',
      serialize: (value) => (value ? '1' : null),
    };
  },
  /** Jour AAAA-MM-JJ (borne de période). Autre format = pas de filtre. */
  day(): FilterField<string> {
    return {
      defaultValue: '',
      parse: (raw) => (raw !== null && DAY_PATTERN.test(raw) ? raw : ''),
      serialize: (value) => (DAY_PATTERN.test(value) ? value : null),
    };
  },
} as const;

export interface UrlFiltersOptions {
  /** Paramètre de page remis à 1 à chaque changement de filtre (défaut `page`). */
  readonly pageParam?: string;
}

export interface UrlFilters<S extends FilterSchema> {
  readonly filters: FilterValues<S>;
  readonly setFilter: <K extends keyof S & string>(key: K, value: FilterValues<S>[K]) => void;
  readonly setFilters: (changes: Partial<FilterValues<S>>) => void;
  /** Efface les filtres du schéma (le tri et les autres paramètres restent). */
  readonly resetFilters: () => void;
  readonly activeFilterCount: number;
  readonly hasActiveFilters: boolean;
}

/**
 * Filtres typés d'une liste, gardés dans l'adresse : le bouton « retour » les
 * retrouve et un lien copié les transmet. Tout changement de filtre ramène à
 * la page 1. Une valeur par défaut n'apparaît pas dans l'adresse (liens courts).
 *
 * Pour une recherche au fil de la frappe, garder la saisie dans un état local
 * et n'écrire ici que la valeur retardée (`useDebounce`).
 *
 * @example
 * const SCHEMA = { search: filterField.text(), statut: filterField.oneOf(STATUTS) };
 * const { filters, setFilter } = useUrlFilters(SCHEMA);
 */
export function useUrlFilters<S extends FilterSchema>(schema: S, options: UrlFiltersOptions = {}): UrlFilters<S> {
  const pageParam = options.pageParam ?? 'page';
  const { search, patch } = useSearchParamsPatch();

  const filters = useMemo(() => readFilters(schema, new URLSearchParams(search)), [schema, search]);

  const setFilters = useCallback((changes: Partial<FilterValues<S>>) => {
    patch(toPatch(schema, changes), { [pageParam]: null });
  }, [schema, patch, pageParam]);

  const setFilter = useCallback(<K extends keyof S & string>(key: K, value: FilterValues<S>[K]) => {
    setFilters({ [key]: value } as unknown as Partial<FilterValues<S>>);
  }, [setFilters]);

  const resetFilters = useCallback(() => {
    const cleared = Object.fromEntries(Object.keys(schema).map((key) => [key, null]));
    patch(cleared, { [pageParam]: null });
  }, [schema, patch, pageParam]);

  const activeFilterCount = useMemo(
    () => Object.keys(schema).filter((key) => !isDefault(schema[key], filters[key])).length,
    [schema, filters],
  );

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
}

function readFilters<S extends FilterSchema>(schema: S, params: URLSearchParams): FilterValues<S> {
  const entries = Object.entries(schema).map(([key, field]) => [key, field.parse(params.get(key))]);
  return Object.fromEntries(entries) as FilterValues<S>;
}

function toPatch<S extends FilterSchema>(schema: S, changes: Partial<FilterValues<S>>): SearchParamsPatch {
  const entries = Object.entries(changes)
    .filter(([key]) => key in schema)
    .map(([key, value]) => {
      const field = schema[key];
      return [key, isDefault(field, value) ? null : field.serialize(value)];
    });
  return Object.fromEntries(entries);
}

function isDefault(field: FilterField<unknown>, value: unknown): boolean {
  return field.serialize(value) === field.serialize(field.defaultValue);
}
