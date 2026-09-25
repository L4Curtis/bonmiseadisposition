import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface ListStateProps {
  readonly loading: boolean;
  /** Message d'erreur à afficher (déjà lisible), ou `null`. */
  readonly error: string | null;
  /** Aucune donnée à afficher (liste vide, ou pas encore chargée). */
  readonly isEmpty: boolean;
  readonly onRetry?: () => void;
  /** « Aucun bon », « Aucun article »… */
  readonly emptyMessage: string;
  /** Action proposée sur une liste vide (« Ajouter un article »). */
  readonly emptyAction?: ReactNode;
  /** La liste est vide À CAUSE des filtres : on le dit et on propose de les effacer. */
  readonly hasActiveFilters?: boolean;
  readonly onClearFilters?: () => void;
  readonly children: ReactNode;
}

const FRAME = 'flex flex-col items-center justify-center px-4 py-16 text-center';

/**
 * États uniformes d'une liste, dans le cadre de la liste :
 * - erreur : message et « Réessayer » (jamais une liste vide trompeuse) ;
 * - premier chargement : squelette annoncé « Chargement… » ;
 * - rechargement : la liste reste affichée, marquée occupée ;
 * - vide : « Aucun … » et l'action utile, ou « Effacer les filtres » ;
 * - sinon la liste (`children`).
 */
export function ListState(props: ListStateProps) {
  const { loading, error, isEmpty, children } = props;
  if (error) return <ErrorFrame message={error} onRetry={props.onRetry} />;
  if (loading && isEmpty) return <LoadingFrame />;
  if (isEmpty) return <EmptyFrame {...props} />;
  return <div aria-busy={loading}>{children}</div>;
}

function ErrorFrame({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={FRAME}>
      <div className="mb-4 rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground/80">Erreur de chargement</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4 h-11 sm:h-8" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

function LoadingFrame() {
  return (
    <div role="status" className="space-y-3 p-4">
      <span className="sr-only">Chargement…</span>
      {[0, 1, 2, 3, 4].map((line) => (
        <Skeleton key={line} className="h-10 w-full" aria-hidden="true" />
      ))}
    </div>
  );
}

function EmptyFrame({ emptyMessage, emptyAction, hasActiveFilters, onClearFilters }: ListStateProps) {
  const filtered = hasActiveFilters === true;
  const Icon = filtered ? SearchX : Inbox;
  return (
    <div className={FRAME}>
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground/80">
        {filtered ? 'Aucun résultat pour ces filtres' : emptyMessage}
      </p>
      {filtered && onClearFilters && (
        <Button size="sm" variant="ghost" className="mt-3 h-11 sm:h-8" onClick={onClearFilters}>
          Effacer les filtres
        </Button>
      )}
      {!filtered && emptyAction && <div className="mt-4">{emptyAction}</div>}
    </div>
  );
}
