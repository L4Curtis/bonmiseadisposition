import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';
import { equipmentLabel, type FicheEquipment } from './types';

interface UndoReturnModalProps {
  readonly equipments: readonly FicheEquipment[];
  readonly onConfirm: (equipmentIds: string[]) => void;
  readonly onCancel: () => void;
  readonly loading: boolean;
}

/**
 * Erreur de marquage « rendu » (R-011) : tant que le collaborateur n'a pas
 * signé la restitution, un équipement coché par erreur redevient « chez le
 * collaborateur ». Le lien de restitution envoyé ne vaut plus ; s'il reste
 * des équipements rendus, une nouvelle signature IT puis un nouveau lien
 * seront demandés.
 */
export function UndoReturnModal({ equipments, onConfirm, onCancel, loading }: UndoReturnModalProps) {
  const candidates = equipments.filter((eq) => eq.returnState === 'returned_to_sign');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className={`sm:max-w-lg ${PHONE_FULLSCREEN_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4" aria-hidden="true" /> Annuler un marquage « rendu »</DialogTitle>
          <DialogDescription>
            Cochez les équipements marqués rendus par erreur : ils redeviendront « chez le collaborateur ». Le lien de
            restitution déjà envoyé ne fonctionnera plus.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {candidates.map((eq) => (
            <label key={eq.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={selected.has(eq.id)} onChange={() => toggle(eq.id)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{equipmentLabel(eq)}</span>
                {eq.serialNumber && <span className="block font-mono text-xs text-muted-foreground">{eq.serialNumber}</span>}
              </span>
            </label>
          ))}
        </div>
        <DialogFooter className={TOUCH_FOOTER}>
          <Button variant="outline" size="sm" className={TOUCH_BUTTON} onClick={onCancel} disabled={loading}>Retour</Button>
          <Button size="sm" className={TOUCH_BUTTON} onClick={() => onConfirm(Array.from(selected))} disabled={loading || selected.size === 0}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            Remettre chez le collaborateur ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
