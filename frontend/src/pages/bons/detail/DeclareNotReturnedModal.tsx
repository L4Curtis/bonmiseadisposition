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
import { equipmentLabel, type FicheEquipment } from './types';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';

interface DeclareNotReturnedModalProps {
  equipments: readonly FicheEquipment[];
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
      setError('Sélectionnez au moins un équipement.');
      return;
    }
    if (!reason.trim()) {
      setError('Le motif est obligatoire.');
      return;
    }
    const dataUrl = getDataUrl();
    if (!dataUrl) {
      setError('Votre signature IT est obligatoire pour certifier le PV de non-restitution.');
      return;
    }
    onConfirm(Array.from(selected), reason, dataUrl);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className={`sm:max-w-lg p-0 overflow-hidden ${PHONE_FULLSCREEN_DIALOG}`}>
        {/* Destructive header */}
        <div className="bg-destructive px-5 py-4">
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-destructive-foreground text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Déclarer des équipements non restitués
            </DialogTitle>
            <DialogDescription className="text-destructive-foreground/80 text-xs mt-1">
              Un PV de non-restitution sera établi, certifié par votre signature IT. Il sera à signer par le collaborateur dès que plus rien d’autre n’est en attente.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto max-sm:max-h-none">
          {unresolvedEquipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun équipement n’est encore chez le collaborateur.
            </p>
          ) : (
            <>
              {/* Equipment list */}
              <div className="space-y-2">
                {unresolvedEquipments.map((eq) => (
                  <label
                    key={eq.id}
                    className={`flex min-h-11 items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(eq.id)
                        ? 'bg-primary/10 border-primary/40'
                        : 'hover:bg-muted/40 border-border'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 rounded border-input accent-primary focus:ring-ring"
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
                  className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm focus:border-destructive focus:ring-1 focus:ring-destructive"
                  rows={2}
                  placeholder="Perte, vol, casse, non restitué par le collaborateur…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {/* IT stamp */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Stamp className="h-3.5 w-3.5" /> Signature IT *
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Elle certifie le PV de non-restitution
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clear}
                    className="flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground/70 hover:text-muted-foreground sm:min-h-0"
                  >
                    <Trash2 className="h-3 w-3" /> Effacer
                  </button>
                </div>
                <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/40 hover:border-destructive/50 transition-colors touch-none">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={120}
                    className="w-full cursor-crosshair block text-foreground"
                    style={{ touchAction: 'none' }}
                    aria-label="Zone de signature : dessinez avec la souris ou le doigt"
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
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className={`px-5 pb-5 pt-0 ${TOUCH_FOOTER}`}>
          <Button variant="outline" size="sm" className={`flex-1 ${TOUCH_BUTTON}`} onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className={`flex-1 ${TOUCH_BUTTON} bg-destructive hover:bg-destructive/90 text-destructive-foreground`}
            onClick={handleSubmit}
            disabled={loading || unresolvedEquipments.length === 0}
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
            ) : (
              <><Pen className="h-3.5 w-3.5" /> Certifier et déclarer ({selected.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
