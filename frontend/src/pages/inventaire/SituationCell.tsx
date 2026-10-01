import { AlertTriangle } from 'lucide-react';
import { BON_STATUS_LABELS, LATENESS_LABELS } from '@/domain/labels';
import { cn } from '@/lib/utils';
import { equipmentOverdueDays } from './dateMetrics';
import { SITUATION_CLASSES } from './situationStyles';
import { NOT_RETURNED_SITUATION, type InventoryItem } from './types';

/** Étape du bon quand elle précise la situation (« Restitution à signer »
 *  sous « En cours ») ; `null` quand elle la répète. */
export function situationStage(item: Pick<InventoryItem, 'situation' | 'situationLabel' | 'bonStatus'>): string | null {
  if (item.situation === NOT_RETURNED_SITUATION) return null;
  const stage = BON_STATUS_LABELS[item.bonStatus];
  return stage && stage !== item.situationLabel ? stage : null;
}

interface SituationCellProps {
  readonly item: InventoryItem;
  readonly className?: string;
}

/**
 * Situation d'un équipement : **une seule étiquette**, au lexique (« Remise à
 * signer », « En cours », « Contesté », « Non restitué »), puis en sous-lignes
 * l'étape du bon si elle précise la situation, le « Retour en retard » et le
 * motif d'une non-restitution. Partagée par le tableau et les cartes.
 */
export function SituationCell({ item, className }: SituationCellProps) {
  const overdueDays = equipmentOverdueDays(item);
  const stage = situationStage(item);
  return (
    <div className={cn('space-y-1', className)}>
      <span
        data-situation-badge
        className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${SITUATION_CLASSES[item.situation]}`}
      >
        {item.situationLabel}
      </span>
      {stage && <div className="text-[11px] text-muted-foreground">{stage}</div>}
      {overdueDays !== null && (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {`${LATENESS_LABELS.return} · ${overdueDays} j`}
        </div>
      )}
      {item.notReturnedReason && <div className="text-[11px] text-muted-foreground">{item.notReturnedReason}</div>}
    </div>
  );
}
