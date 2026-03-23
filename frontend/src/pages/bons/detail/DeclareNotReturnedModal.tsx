import { useState } from 'react';
import { AlertTriangle, Loader2, Pen, Stamp, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';
import type { EquipmentItem } from './types';
import { equipmentLabel } from './types';

interface DeclareNotReturnedModalProps {
  equipments: EquipmentItem[];
  onConfirm: (equipmentIds: string[], reason: string, signatureDataUrl: string) => void;
  onCancel: () => void;
  loading: boolean;
}

export function DeclareNotReturnedModal({
  equipments,
  onConfirm,
  onCancel,
  loading,
}: DeclareNotReturnedModalProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } =
    useSignatureCanvas();

  const unresolvedEquipments = equipments.filter((eq) => !eq.returnedAt && !eq.notReturned);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    setError(null);
    if (selected.size === 0) {
      setError('S\u00e9lectionnez au moins un \u00e9quipement.');
      return;
    }
    if (!reason.trim()) {
      setError('Le motif est obligatoire.');
      return;
    }
    const dataUrl = getDataUrl();
    if (!dataUrl) {
      setError('Le cachet IT est obligatoire pour certifier ce proc\u00e8s-verbal.');
      return;
    }
    onConfirm(Array.from(selected), reason, dataUrl);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Red header */}
        <div className="bg-red-600 px-5 py-4">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-white text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> D\u00e9clarer des \u00e9quipements non rendus
            </DialogTitle>
            <DialogDescription className="text-red-100 text-xs mt-1">
              Un proc\u00e8s-verbal sera g\u00e9n\u00e9r\u00e9 et certifi\u00e9 par votre cachet IT.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {unresolvedEquipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tous les \u00e9quipements ont \u00e9t\u00e9 trait\u00e9s.
            </p>
          ) : (
            <>
              {/* Equipment list */}
              <div className="space-y-2">
                {unresolvedEquipments.map((eq) => (
                  <label
                    key={eq.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(eq.id)
                        ? 'bg-red-50 border-red-300'
                        : 'hover:bg-muted/40 border-border'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                      checked={selected.has(eq.id)}
                      onChange={() => toggle(eq.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{equipmentLabel(eq)}</span>
                      {eq.serialNumber && (
                        <span className="text-xs text-muted-foreground/70 ml-2 font-mono">{eq.serialNumber}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Motif *
                </label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  rows={2}
                  placeholder="Perte, vol, casse, non restitu\u00e9 par le collaborateur\u2026"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {/* IT stamp */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Stamp className="h-3.5 w-3.5" /> Cachet du service informatique *
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Apposez votre cachet pour certifier ce PV
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clear}
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground"
                  >
                    <Trash2 className="h-3 w-3" /> Effacer
                  </button>
                </div>
                <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/40 hover:border-red-300 transition-colors touch-none">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={120}
                    className="w-full cursor-crosshair block"
                    style={{ touchAction: 'none' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                  />
                  {isEmpty && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <p className="text-slate-300 text-sm select-none">Signez ici&hellip;</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 pt-0">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleSubmit}
            disabled={loading || unresolvedEquipments.length === 0}
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
            ) : (
              <><Pen className="h-3.5 w-3.5" /> Certifier et d\u00e9clarer ({selected.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
