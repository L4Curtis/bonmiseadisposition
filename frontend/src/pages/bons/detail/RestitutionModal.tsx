import { useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EquipmentItem } from './types';
import { equipmentLabel } from './types';

interface RestitutionModalProps {
  equipments: EquipmentItem[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  loading: boolean;
}

export function RestitutionModal({ equipments, onConfirm, onCancel, loading }: RestitutionModalProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

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
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Blue header */}
        <div className="bg-blue-600 px-5 py-4">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-white text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Initier la restitution
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-xs mt-1">
              Cochez les \u00e9quipements restitu\u00e9s par le collaborateur
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {equipments.map((eq) => {
            const isReturned = !!eq.returnedAt;
            const isDeclaredNotReturned = !!eq.notReturned;
            const isPending = !isReturned && !isDeclaredNotReturned;

            return (
              <label
                key={eq.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isReturned
                    ? 'bg-green-50 border-green-200 opacity-60'
                    : isDeclaredNotReturned
                      ? 'bg-red-50 border-red-200 opacity-60'
                      : selected.has(eq.id)
                        ? 'bg-blue-50 border-blue-300'
                        : 'hover:bg-muted/40 border-border'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={isReturned || selected.has(eq.id)}
                  disabled={isReturned || isDeclaredNotReturned}
                  onChange={() => isPending && toggle(eq.id)}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{equipmentLabel(eq)}</span>
                  {eq.serialNumber && (
                    <span className="text-xs text-muted-foreground/70 ml-2 font-mono">{eq.serialNumber}</span>
                  )}
                </div>
                {isReturned && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Rendu
                  </span>
                )}
                {isDeclaredNotReturned && (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Non rendu
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <DialogFooter className="px-5 pb-5 pt-0">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={loading || selected.size === 0}
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
            ) : (
              <>Lancer la restitution ({selected.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
