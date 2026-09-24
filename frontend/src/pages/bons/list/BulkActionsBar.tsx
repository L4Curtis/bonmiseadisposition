import { Download, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface BulkActionsBarProps {
  readonly selectedCount: number;
  /** Bons de la sélection dont le lien peut être relancé. */
  readonly resendableCount: number;
  readonly onResend: () => void;
  readonly onExport: () => void;
  readonly onClear: () => void;
  readonly busy: boolean;
}

/** Actions sur la sélection de la page : relance groupée des liens de
 *  signature et export CSV des seuls bons cochés. */
export function BulkActionsBar({ selectedCount, resendableCount, onResend, onExport, onClear, busy }: BulkActionsBarProps) {
  const plural = selectedCount > 1 ? 's' : '';
  return (
    <div
      role="region"
      aria-label="Actions sur la sélection"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--primary)/0.30)] bg-[hsl(var(--primary)/0.05)] px-3 py-2"
    >
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {selectedCount} bon{plural} sélectionné{plural}
      </span>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <Button
          size="sm"
          variant="outline"
          onClick={onResend}
          disabled={busy || resendableCount === 0}
          title={resendableCount === 0 ? 'Aucun bon sélectionné n’attend de signature par email' : undefined}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Relancer les liens{resendableCount > 0 ? ` (${resendableCount})` : ''}
        </Button>
        <Button size="sm" variant="outline" onClick={onExport} disabled={busy}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exporter la sélection
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Désélectionner
        </Button>
      </div>
    </div>
  );
}
