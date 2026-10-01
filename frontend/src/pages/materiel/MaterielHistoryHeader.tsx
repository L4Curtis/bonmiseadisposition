import { useNavigate } from 'react-router';
import { ChevronLeft, History } from 'lucide-react';
import { ExportButton } from '@/components/export';
import { todayInParis } from '@/lib/dates';
import type { CurrentHolderStatus } from './types';

const STATUS_CLASSES: Record<CurrentHolderStatus['kind'], string> = {
  chez_collaborateur: 'text-foreground/80',
  a_signer: 'text-warning',
  prevu: 'text-muted-foreground',
  rendu: 'text-success',
  non_restitue: 'text-destructive',
  aucun: 'text-muted-foreground',
};

export interface MaterielHistoryHeaderProps {
  readonly reference: string;
  readonly label: string;
  readonly status: CurrentHolderStatus;
  /** Nombre de bons de l'historique (`total` de la liste), annoncé avant l'export. */
  readonly exportCount: number | null;
  /** Plafond de l'export annoncé par le serveur (`meta.exportLimit`). */
  readonly exportLimit?: number;
}

/** En-tête de la page /materiel/:reference : le numéro recherché, le
 *  modèle/désignation, et l'état actuel (chez qui, depuis quand, rendu le …,
 *  déclaré non restitué, ou seulement prévu sur un brouillon), et l'export
 *  CSV de tout son historique (le serveur nomme le fichier). */
export function MaterielHistoryHeader({ reference, label, status, exportCount, exportLimit }: MaterielHistoryHeaderProps) {
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

      <ExportButton
        className="w-full sm:w-auto"
        path={`/equipment/history/export?q=${encodeURIComponent(reference)}`}
        fallbackFilename={`historique-equipement-${todayInParis()}.csv`}
        filters={[{ label: 'Numéro', value: reference }]}
        count={exportCount}
        limit={exportLimit}
        itemLabel={{ singular: 'bon', plural: 'bons' }}
        note="Tout l'historique de l'équipement, toutes pages confondues, du plus récent au plus ancien."
      />
    </div>
  );
}
