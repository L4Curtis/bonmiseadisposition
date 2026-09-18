import { Label } from '@/components/ui/label';
import { Toggle } from './Toggle';

interface FilialesStatusFilterProps {
  showInactive: boolean;
  onChange: (value: boolean) => void;
  inactiveCount: number;
}

const TOGGLE_ID = 'filiales-show-inactive';

/** Contrôle d'affichage des filiales désactivées : masquées par défaut, avec
 *  un contrôle clair (et un compteur) pour les révéler ponctuellement. */
export function FilialesStatusFilter({ showInactive, onChange, inactiveCount }: FilialesStatusFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <Toggle id={TOGGLE_ID} checked={showInactive} onChange={onChange} />
      <Label htmlFor={TOGGLE_ID} className="cursor-pointer select-none text-sm text-muted-foreground">
        Afficher les filiales désactivées{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
      </Label>
    </div>
  );
}
