import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncatedMessage } from './export-summary';

export interface ExportTruncatedBannerProps {
  /** Nombre de lignes annoncé avant l'export, s'il était connu. */
  readonly count: number | null;
  /** Plafond du serveur, s'il est connu. */
  readonly limit?: number;
  readonly onDismiss: () => void;
  readonly className?: string;
}

/**
 * Bandeau affiché après un export coupé à son plafond (en-tête `X-Truncated`
 * du serveur) : il reste visible jusqu'à ce que l'utilisateur le ferme ou
 * relance un export complet, pour qu'un fichier incomplet ne passe jamais
 * pour complet.
 */
export function ExportTruncatedBanner({ count, limit, onDismiss, className }: ExportTruncatedBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-left',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">Export incomplet</p>
        <p className="mt-0.5 text-muted-foreground">{truncatedMessage(count, limit)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer l’avertissement"
        className="-mr-2 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
