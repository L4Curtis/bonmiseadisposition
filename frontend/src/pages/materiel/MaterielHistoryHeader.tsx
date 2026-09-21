import { useNavigate } from 'react-router';
import { ChevronLeft, Download, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CurrentHolderStatus } from './types';

const STATUS_CLASSES: Record<CurrentHolderStatus['kind'], string> = {
  en_circulation: 'text-foreground/80',
  rendu: 'text-success',
  non_rendu: 'text-destructive',
};

export interface MaterielHistoryHeaderProps {
  readonly reference: string;
  readonly label: string;
  readonly status: CurrentHolderStatus;
  readonly onExport: () => void;
  readonly exportLoading: boolean;
}

/** En-tête de la page /materiel/:reference : le numéro recherché, le
 *  modèle/désignation, et l'état actuel (chez qui, depuis quand, rendu le …,
 *  ou déclaré non rendu). */
export function MaterielHistoryHeader({ reference, label, status, onExport, exportLoading }: MaterielHistoryHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 text-muted-foreground/70 hover:text-muted-foreground"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-xl font-bold font-mono text-foreground">{reference}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
          <p className={`text-xs mt-1 font-medium ${STATUS_CLASSES[status.kind]}`}>{status.label}</p>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onExport} disabled={exportLoading}>
        {exportLoading ? (
          <span
            className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-muted border-t-muted-foreground"
            role="status"
            aria-label="Export en cours"
          />
        ) : (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        )}
        Exporter CSV
      </Button>
    </div>
  );
}
