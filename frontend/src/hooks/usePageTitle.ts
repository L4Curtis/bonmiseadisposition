import { useEffect, useRef } from 'react';

/** Nom court de l'application, à la fin de chaque titre d'onglet. */
export const APP_NAME = 'Bons IT';

/** « Inventaire · Bons IT » ; sans titre, le nom de l'application seul. */
export function documentTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
}

/**
 * Qui fixe le titre :
 * - `route` : titre déduit de l'adresse, posé par la mise en page ;
 * - `page` : titre précis posé par l'écran (la référence d'un bon), qui
 *   l'emporte tant que l'écran est affiché.
 */
export type PageTitleLevel = 'route' | 'page';

interface TitleEntry {
  readonly id: number;
  readonly level: PageTitleLevel;
  readonly title: string | null;
}

// Titres déclarés par les composants affichés, dans l'ordre de déclaration.
let entries: readonly TitleEntry[] = [];
let nextId = 1;

function applyTitle(): void {
  const withTitle = entries.filter((entry) => entry.title);
  const winner = [...withTitle].reverse().find((entry) => entry.level === 'page')
    ?? [...withTitle].reverse().find((entry) => entry.level === 'route');
  document.title = documentTitle(winner?.title ?? null);
}

/**
 * Titre de l'onglet du navigateur (« Inventaire · Bons IT ») : on distingue
 * ses onglets, et l'historique et les favoris portent un nom utile.
 * La mise en page pose le titre de la route ; un écran peut le préciser
 * (`usePageTitle(bon?.reference ?? null)`). Au démontage, le titre précédent
 * revient.
 */
export function usePageTitle(title: string | null, level: PageTitleLevel = 'page'): void {
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    const id = nextId++;
    idRef.current = id;
    entries = [...entries, { id, level, title: null }];
    return () => {
      entries = entries.filter((entry) => entry.id !== id);
      idRef.current = null;
      applyTitle();
    };
  }, [level]);

  useEffect(() => {
    const id = idRef.current;
    entries = entries.map((entry) => (entry.id === id ? { ...entry, title } : entry));
    applyTitle();
  }, [title, level]);
}
