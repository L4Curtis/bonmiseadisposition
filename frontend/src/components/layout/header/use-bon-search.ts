import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { BonStatus } from '@/types';

/** Équipement d'un bon tel que renvoyé par GET /bons (BON_SELECT_SHAPE côté
 *  backend — voir backend/src/common/types.ts) : c'est ce qui permet, quand
 *  la recherche correspond à un n° de série OU un n° d'inventaire (les deux
 *  comptent autant l'un que l'autre), d'afficher l'équipement visé. */
export interface SearchHitEquipment {
  id: string;
  serialNumber: string | null;
  inventoryNumber: string | null;
  customLabel: string | null;
  catalogItem: { brand: string; model: string } | null;
}

export interface SearchHit {
  id: string;
  reference: string;
  status: BonStatus;
  collaborateur: { displayName: string; email: string };
  equipments?: SearchHitEquipment[];
}

export interface BonSearchState {
  readonly results: readonly SearchHit[];
  readonly loading: boolean;
  /** Recherche en échec (réseau, serveur) : à distinguer de « aucun résultat »,
   *  sous peine de masquer une vraie panne. */
  readonly error: boolean;
  /** Une recherche a abouti (ou échoué) pour la saisie courante. */
  readonly settled: boolean;
}

const IDLE: BonSearchState = { results: [], loading: false, error: false, settled: false };

/** Délai après la dernière frappe avant d'interroger le serveur. */
const DEBOUNCE_MS = 250;
/** Nombre de caractères à partir duquel on cherche. */
export const MIN_QUERY_LENGTH = 2;

/** Résultats proposés sous le champ de recherche. */
const MAX_HITS = 6;

/** Dernière recherche aboutie : la saisie cherchée et sa réponse. */
interface CompletedSearch {
  readonly query: string;
  readonly results: readonly SearchHit[];
  readonly error: boolean;
}

/**
 * Recherche de bons au fil de la frappe (référence, collaborateur, n° de série
 * ou d'inventaire), partagée par la recherche de l'en-tête (ordinateur) et la
 * recherche plein écran (téléphone). Pendant une nouvelle recherche, les
 * résultats précédents restent affichés.
 */
export function useBonSearch(value: string): BonSearchState {
  const query = value.trim();
  const searchable = query.length >= MIN_QUERY_LENGTH;
  const [completed, setCompleted] = useState<CompletedSearch | null>(null);
  // Un appel au serveur à la fin de la frappe, pas un par lettre.
  const debounced = useDebounce(query, DEBOUNCE_MS);

  useEffect(() => {
    if (debounced.length < MIN_QUERY_LENGTH) return undefined;
    // Ignore une réponse arrivée après un changement de saisie.
    let ignore = false;
    // Première page de la liste (taille commune minimale), dont on garde les
    // premiers résultats : la liste n'accepte que 25, 50 ou 100 lignes.
    api
      .getList<SearchHit>(`/bons?search=${encodeURIComponent(debounced)}&limit=25`)
      .then((data) => {
        if (!ignore) setCompleted({ query: debounced, results: data.items.slice(0, MAX_HITS), error: false });
      })
      .catch(() => {
        if (!ignore) setCompleted({ query: debounced, results: [], error: true });
      });
    return () => {
      ignore = true;
    };
  }, [debounced]);

  if (!searchable) return IDLE;
  const settled = completed?.query === query;
  return {
    results: completed?.results ?? [],
    loading: !settled,
    error: settled && completed.error,
    settled,
  };
}

export function equipmentHitLabel(eq: SearchHitEquipment): string {
  return eq.catalogItem ? `${eq.catalogItem.brand} ${eq.catalogItem.model}` : eq.customLabel || 'Équipement';
}

/** Équipement du bon dont le n° de série OU le n° d'inventaire correspond à
 *  la saisie — `undefined` si la correspondance vient de la référence ou du
 *  collaborateur. */
export function findMatchingEquipment(hit: SearchHit, query: string): SearchHitEquipment | undefined {
  const q = query.toLowerCase();
  return hit.equipments?.find(
    (eq) => eq.serialNumber?.toLowerCase().includes(q) || eq.inventoryNumber?.toLowerCase().includes(q),
  );
}

/** Le n° (série ou inventaire) qui a effectivement correspondu — affiché à côté
 *  du libellé de l'équipement, à ne pas confondre avec l'autre n°, non affiché. */
export function matchedReference(eq: SearchHitEquipment, query: string): string {
  const q = query.toLowerCase();
  return eq.serialNumber?.toLowerCase().includes(q) ? eq.serialNumber : (eq.inventoryNumber ?? '');
}
