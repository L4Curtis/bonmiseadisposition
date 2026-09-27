import { useState } from 'react';
import { Loader2, Mail, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { Channel } from './actions/bon-dialog';
import { EQUIPMENT_RETURN_STATE_LABELS } from './bon-lexicon';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';
import { equipmentLabel, type FicheEquipment } from './types';

interface RestitutionModalProps {
  equipments: readonly FicheEquipment[];
  channel: Channel;
  /** `selectedIds` : équipements nouvellement rendus (peut être vide si des
   *  équipements déjà marqués attendent leur signature). */
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  loading: boolean;
}

const TITLES: Readonly<Record<Channel, string>> = {
  email: 'Restitution par email',
  in_person: 'Restitution au guichet',
};

/**
 * Sélection des équipements rendus — la même fenêtre par email et au guichet
 * (R-001). Les équipements déjà marqués rendus et pas encore signés restent
 * cochés : ils font partie de la même restitution. Étapes suivantes :
 * signature IT, puis le lien (email ou QR code).
 */
export function RestitutionModal({ equipments, channel, onConfirm, onCancel, loading }: RestitutionModalProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const alreadyMarked = equipments.filter((eq) => eq.returnState === 'returned_to_sign').length;
  const count = selected.size + alreadyMarked;
  const Icon = channel === 'email' ? Mail : Smartphone;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className={`overflow-hidden p-0 sm:max-w-lg ${PHONE_FULLSCREEN_DIALOG}`}>
        <div className="bg-primary px-5 py-4 pr-12">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="flex items-center gap-2 text-sm text-primary-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" /> {TITLES[channel]}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-primary-foreground/80">
              Cochez les équipements que le collaborateur rend aujourd’hui. Ceux qui ne sont pas cochés restent chez lui.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5 max-sm:max-h-none">
          {equipments.map((eq) => {
            const state = eq.returnState ?? (eq.notReturned ? 'not_returned' : eq.returnedAt ? 'returned' : 'out');
            const selectable = state === 'out';
            const checked = state === 'returned_to_sign' || state === 'returned' || selected.has(eq.id);
            return (
              <label
                key={eq.id}
                className={`flex min-h-11 items-center gap-3 rounded-lg border p-3 transition-colors ${
                  selectable ? 'cursor-pointer hover:bg-muted/40' : 'opacity-70'
                } ${selected.has(eq.id) || state === 'returned_to_sign' ? 'border-primary/40 bg-primary/10' : 'border-border'}`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 rounded border-input accent-primary"
                  checked={checked}
                  disabled={!selectable || loading}
                  onChange={() => toggle(eq.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{equipmentLabel(eq)}</span>
                  {eq.serialNumber && <span className="block font-mono text-xs text-muted-foreground/80">{eq.serialNumber}</span>}
                </span>
                {!selectable && <span className="shrink-0 text-right text-xs text-muted-foreground">{EQUIPMENT_RETURN_STATE_LABELS[state]}</span>}
              </label>
            );
          })}
        </div>

        <DialogFooter className={`px-5 pb-5 pt-0 ${TOUCH_FOOTER}`}>
          <Button variant="outline" size="sm" className={`flex-1 ${TOUCH_BUTTON}`} onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button size="sm" className={`flex-1 ${TOUCH_BUTTON}`} onClick={() => onConfirm(Array.from(selected))} disabled={loading || count === 0}>
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> En cours&hellip;</>
              : <>Continuer : signature IT ({count})</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
