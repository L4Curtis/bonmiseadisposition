import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SendSerialConflict } from './types';

interface SendSerialConflictsModalProps {
  readonly conflicts: readonly SendSerialConflict[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly loading: boolean;
}

/** Alerte non bloquante affichée quand POST /bons/:id/send renvoie 409
 *  { code: 'serial_conflicts' } : un ou plusieurs numéros de série de ce bon
 *  sont déjà prêtés sur un autre bon actif. L'IT confirme en connaissance de
 *  cause (renvoie confirmSerialConflicts: true) ou annule pour corriger. */
export function SendSerialConflictsModal({ conflicts, onConfirm, onCancel, loading }: SendSerialConflictsModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> Numéros de série déjà en circulation
          </DialogTitle>
          <DialogDescription>
            Les numéros de série suivants sont déjà prêtés sur un autre bon actif. Envoyer quand même ?
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-56 overflow-y-auto list-disc pl-5 text-sm space-y-1 text-foreground">
          {conflicts.map((c, i) => (
            <li key={`${c.serialNumber}-${i}`}>
              <span className="font-mono">{c.serialNumber}</span> — {c.bonReference}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
            ) : (
              'Envoyer quand même'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
