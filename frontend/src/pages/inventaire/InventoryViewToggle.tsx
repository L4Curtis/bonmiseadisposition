import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InventoryView } from './types';

interface InventoryViewToggleProps {
  view: InventoryView;
  onChange: (view: InventoryView) => void;
}

/** Bascule « Par équipement / Par collaborateur » — état vécu dans l'URL
 *  (paramètre `vue`, cf. useInventory.ts), conservé au rechargement. */
export function InventoryViewToggle({ view, onChange }: InventoryViewToggleProps) {
  return (
    <Tabs value={view} onValueChange={(v) => onChange(v === 'collaborateurs' ? 'collaborateurs' : 'equipements')}>
      <TabsList>
        <TabsTrigger value="equipements">Par équipement</TabsTrigger>
        <TabsTrigger value="collaborateurs">Par collaborateur</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
