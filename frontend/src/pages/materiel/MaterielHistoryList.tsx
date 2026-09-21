import { Link } from 'react-router';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';
import type { MaterielHistoryEntry } from './types';

export interface MaterielHistoryListProps {
  readonly entries: readonly MaterielHistoryEntry[];
  /** Direction : lecture seule, aucun accès aux bons individuels (/bons/:id
   *  → 403) — même règle que l'inventaire (canLinkToBon, pages/Inventaire.tsx). */
  readonly canLinkToBon: boolean;
}

/** Suite des détenteurs d'un matériel, du plus récent au plus ancien (ordre
 *  déjà garanti côté backend — voir getEquipmentHistory). */
export function MaterielHistoryList({ entries, canLinkToBon }: MaterielHistoryListProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden" aria-label="Historique des détenteurs">
      {entries.map((entry) => (
        <li key={entry.equipmentId} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            {canLinkToBon ? (
              <Link to={`/bons/${entry.bon.id}`} className="font-mono text-sm font-medium hover:underline">
                {entry.bon.reference}
              </Link>
            ) : (
              <span className="font-mono text-sm font-medium">{entry.bon.reference}</span>
            )}
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {entry.bon.collaborateur.displayName} · {entry.bon.filiale.displayName}
              {entry.label ? ` · ${entry.label}` : ''}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {`Du ${formatDate(entry.bon.dateMiseDisposition)}`}
              {entry.bon.dateRestitution ? ` — restitution prévue le ${formatDate(entry.bon.dateRestitution)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {entry.returnedAt && (
              <span className="text-xs text-success">{`Rendu le ${formatDate(entry.returnedAt)}`}</span>
            )}
            {entry.notReturned && (
              <span className="text-xs text-destructive">Non rendu</span>
            )}
            <StatusBadge status={entry.bon.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
