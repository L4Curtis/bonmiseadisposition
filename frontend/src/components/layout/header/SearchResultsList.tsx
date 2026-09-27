import { WifiOff } from 'lucide-react';
import { BON_STATUS_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import {
  equipmentHitLabel,
  findMatchingEquipment,
  matchedReference,
  type BonSearchState,
  type SearchHit,
} from './use-bon-search';

interface SearchResultsListProps {
  readonly query: string;
  readonly search: BonSearchState;
  /** Rang du résultat mis en avant au clavier (flèches). */
  readonly active: number;
  readonly onHover?: (index: number) => void;
  readonly onSelect: (id: string) => void;
  readonly onSeeAll: () => void;
  /** `touch` : lignes de 44 px au moins, texte plus grand (recherche plein écran). */
  readonly touch?: boolean;
}

function HitRow({ hit, query, highlighted, touch }: {
  readonly hit: SearchHit;
  readonly query: string;
  readonly highlighted: boolean;
  readonly touch: boolean;
}) {
  const matchedEquipment = findMatchingEquipment(hit, query);
  return (
    <span
      className={cn(
        'flex w-full items-center gap-3 px-3 text-left',
        touch ? 'min-h-12 py-2.5' : 'py-2',
        highlighted ? 'bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">{hit.reference}</span>
      <span className={cn('min-w-0 flex-1 truncate text-foreground', touch ? 'text-base' : 'text-sm')}>
        {hit.collaborateur.displayName}
        {matchedEquipment && (
          <span className="ml-2 truncate text-xs text-muted-foreground">
            · <span>{equipmentHitLabel(matchedEquipment)}</span> — <span className="font-mono">{matchedReference(matchedEquipment, query)}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{BON_STATUS_LABELS[hit.status]}</span>
    </span>
  );
}

/** Résultats de la recherche de bons : liste, attente, aucun résultat ou panne. */
export function SearchResultsList({ query, search, active, onHover, onSelect, onSeeAll, touch = false }: SearchResultsListProps) {
  const messageClass = cn('px-3 py-3 text-muted-foreground', touch ? 'text-sm' : 'text-xs');

  if (search.loading && search.results.length === 0) {
    return <p className={messageClass}>Recherche…</p>;
  }
  if (search.error) {
    return (
      <p role="alert" className={cn(messageClass, 'flex items-center gap-2 text-destructive')}>
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Recherche indisponible (erreur réseau). Réessayez.
      </p>
    );
  }
  if (search.results.length === 0) {
    return <p className={messageClass}>Aucun bon. Entrée pour la recherche complète.</p>;
  }
  return (
    <ul className={cn('overflow-y-auto py-1', !touch && 'max-h-80')}>
      {search.results.map((hit, index) => (
        <li key={hit.id}>
          <button
            type="button"
            className="block w-full"
            onMouseEnter={onHover ? () => onHover(index) : undefined}
            onClick={() => onSelect(hit.id)}
          >
            <HitRow hit={hit} query={query} highlighted={index === active} touch={touch} />
          </button>
        </li>
      ))}
      <li className="border-t border-border">
        <button
          type="button"
          onClick={onSeeAll}
          className={cn('w-full px-3 text-left text-primary hover:bg-muted/60', touch ? 'min-h-12 text-sm' : 'py-2 text-xs')}
        >
          Voir tous les résultats pour « {query} »
        </button>
      </li>
    </ul>
  );
}
