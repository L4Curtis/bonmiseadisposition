import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoryText, equipmentStateForCollaborator } from '@/pages/portail/lib/portal-labels';
import type { CollaboratorBon } from '../lib/collaborator-view';

const STATE_CLASSES = {
  held: 'bg-muted text-foreground',
  to_sign: 'bg-warning/10 text-warning',
  returned: 'bg-success/10 text-success',
  not_returned: 'bg-destructive/10 text-destructive',
} as const;

function equipmentLabel(eq: CollaboratorBon['equipments'][number]): string {
  return eq.catalogItem ? `${eq.catalogItem.brand} ${eq.catalogItem.model}` : eq.customLabel || 'Équipement';
}

interface CollabEquipmentListProps {
  bon: CollaboratorBon;
  /** Le document en attente est en cours de correction (contestation Fondée) :
   *  les marquages non signés ne sont plus affirmés. */
  underCorrection?: boolean;
}

/** Équipements du bon, en cartes : désignation, catégorie lisible (jamais le
 *  code interne), n° de série et d'inventaire, et où en est chacun. */
export function CollabEquipmentList({ bon, underCorrection = false }: CollabEquipmentListProps) {
  const showState = bon.status !== 'sent_mise_dispo';
  const equipments = [...bon.equipments].sort((a, b) => a.order - b.order);
  return (
    <section aria-labelledby="equipements-du-bon" className="space-y-2">
      <h2 id="equipements-du-bon" className="flex items-center gap-2 font-semibold">
        <Package className="h-4 w-4 text-muted-foreground" /> Équipements ({equipments.length})
      </h2>
      <ul className="grid gap-2 lg:grid-cols-2">
        {equipments.map((eq) => {
          const category = categoryText(eq.catalogItem?.category);
          const state = equipmentStateForCollaborator(eq, underCorrection);
          return (
            <li key={eq.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium [overflow-wrap:anywhere]">{equipmentLabel(eq)}</p>
                {showState && (
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATE_CLASSES[state.tone])}>{state.label}</span>
                )}
              </div>
              {category && <p className="text-sm text-muted-foreground">{category}</p>}
              <p className="text-sm text-muted-foreground">
                N° de série <span className="font-mono text-foreground">{eq.serialNumber || 'non renseigné'}</span>
              </p>
              {eq.inventoryNumber && (
                <p className="text-sm text-muted-foreground">
                  N° d'inventaire <span className="font-mono text-foreground">{eq.inventoryNumber}</span>
                </p>
              )}
              {eq.notReturned && eq.notReturnedReason && !underCorrection && <p className="text-sm text-destructive">{eq.notReturnedReason}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
