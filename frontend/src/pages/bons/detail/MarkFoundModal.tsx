import { useState } from 'react';
import { Loader2, PackageCheck, Stamp, Trash2, XCircle } from 'lucide-react';
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

interface MarkFoundModalProps {
  equipments: EquipmentItem[];
  onConfirm: (equipmentIds: string[], signatureDataUrl: string) => void;
  onCancel: () => void;
  loading: boolean;
  isArchived?: boolean;
}

export function MarkFoundModal({
  equipments,
  onConfirm,
  onCancel,
  loading,
  isArchived,
}: MarkFoundModalProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } =
    useSignatureCanvas();

  const notReturnedEquipments = equipments.filter((eq) => eq.notReturned);

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
      setError('Sélectionnez au moins un équipement retrouvé.');
      return;
    }
    const dataUrl = getDataUrl();
    if (!dataUrl) {
      setError('Le cachet IT est obligatoire pour mettre à jour le PV.');
      return;
    }
    onConfirm(Array.from(selected), dataUrl);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Green header */}
        <div className="bg-green-600 px-5 py-4">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-white text-sm flex items-center gap-2">
              <PackageCheck className="h-4 w-4" /> Équipement(s) retrouvé(s)
            </DialogTitle>
            <DialogDescription className="text-green-100 text-xs mt-1">
              {isArchived
                ? "Un avenant IT sera généré. Le collaborateur n'aura pas à re-signer."
                : 'Le PV sera mis à jour et renvoyé au collaborateur pour signature.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {notReturnedEquipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun équipement non rendu.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Sélectionnez les équipements qui ont été retrouvés :
              </p>
              <div className="space-y-2">
                {notReturnedEquipments.map((eq) => (
                  <label
                    key={eq.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(eq.id)
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800'
                        : 'hover:bg-muted/40 border-border'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                      checked={selected.has(eq.id)}
                      onChange={() => toggle(eq.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{equipmentLabel(eq)}</span>
                      {eq.serialNumber && (
                        <span className="text-xs text-muted-foreground/70 ml-2 font-mono">{eq.serialNumber}</span>
                      )}
                    </div>
                    {eq.notReturnedReason && (
                      <span
                        className="text-xs text-red-600 italic shrink-0 max-w-[120px] truncate"
                        title={eq.notReturnedReason}
                      >
                        {eq.notReturnedReason}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {/* IT stamp */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Stamp className="h-3.5 w-3.5" /> Cachet du service informatique *
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {isArchived
                        ? 'Apposez votre cachet pour certifier cet avenant'
                        : 'Apposez votre cachet pour valider la mise à jour du PV'}
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
                <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/40 hover:border-green-300 transition-colors touch-none">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={120}
                    className="w-full cursor-crosshair block text-foreground"
                    style={{ touchAction: 'none' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                  />
                  {isEmpty && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <p className="text-muted-foreground/40 text-sm select-none">Signez ici&hellip;</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
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
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleSubmit}
            disabled={loading || notReturnedEquipments.length === 0}
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
            ) : isArchived ? (
              <><PackageCheck className="h-3.5 w-3.5" /> Générer l&apos;avenant ({selected.size})</>
            ) : (
              <><PackageCheck className="h-3.5 w-3.5" /> Mettre à jour le PV ({selected.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
