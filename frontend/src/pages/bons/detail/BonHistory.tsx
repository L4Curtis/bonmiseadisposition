import { useState } from 'react';
import { History } from 'lucide-react';
import type { AuditActionTone } from '@/contracts/audit-actions';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useBonHistory } from './useBonHistory';

/** Au-delà, l'historique montre les dernières actions et propose le reste. */
export const HISTORY_COLLAPSED_COUNT = 8;

/** Pastille de chaque action, selon son ton (catalogue du journal). */
const TONE_DOT: Readonly<Record<AuditActionTone, string>> = {
  action: 'bg-foreground/60',
  success: 'bg-success',
  warning: 'bg-warning',
  failure: 'bg-destructive',
  technical: 'bg-muted-foreground/50',
};

export interface BonHistoryProps {
  readonly bonId: string;
  /** Change après chaque action sur le bon (date de modification) : relit l'historique. */
  readonly refreshKey: string;
}

/**
 * Bloc « Historique » de la fiche IT : qui a fait quoi, et quand, dans l'ordre
 * des événements, avec les phrases du journal d'audit. Sur un historique long,
 * les dernières actions d'abord visibles, le reste à la demande.
 */
export function BonHistory({ bonId, refreshKey }: BonHistoryProps) {
  const { entries, truncated, total, loading, error } = useBonHistory(bonId, refreshKey);
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, entries.length - HISTORY_COLLAPSED_COUNT);
  const visible = entries.slice(hidden);

  return (
    <section className="rounded-xl border bg-card p-4 space-y-3" aria-labelledby="bon-history-title">
      <h2 id="bon-history-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Historique
      </h2>

      {loading && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">Chargement de l’historique…</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune action enregistrée pour ce bon.</p>
      ) : (
        <>
          {(hidden > 0 || truncated) && (
            <p className="text-xs text-muted-foreground">
              {truncated ? `Seules les ${entries.length} dernières actions sur ${total} sont affichées. ` : ''}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="min-h-11 font-medium text-primary hover:underline sm:min-h-0"
                >
                  {`Afficher les ${hidden} action${hidden > 1 ? 's' : ''} précédente${hidden > 1 ? 's' : ''}`}
                </button>
              )}
            </p>
          )}
          <ol className="space-y-3">
            {visible.map((entry) => (
              <li key={entry.id} className="flex gap-3 text-sm">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[entry.tone])} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-foreground">{entry.sentence}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    <span aria-hidden="true"> · </span>
                    {entry.label}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
