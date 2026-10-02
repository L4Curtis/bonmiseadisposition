import { X } from 'lucide-react';

export interface ListNoticeProps {
  readonly message: string;
  readonly onDismiss: () => void;
}

/** Bandeau d'information au-dessus de la liste (filtres écartés parce
 *  qu'invalides) : la liste reste utilisable, le message se ferme d'un geste. */
export function ListNotice({ message, onDismiss }: ListNoticeProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1 text-sm text-foreground"
    >
      <p className="min-w-0 flex-1 py-2.5">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md -mr-2 text-muted-foreground hover:text-foreground"
        aria-label="Fermer le message"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
