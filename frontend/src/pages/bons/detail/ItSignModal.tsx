import { useState } from 'react';
import { Loader2, Pen, Stamp, Trash2, XCircle } from 'lucide-react';
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
import { api } from '@/lib/api';

interface ItSignModalProps {
  bonId: string;
  reference: string;
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  onClose: () => void;
  onSigned: () => Promise<void>;
}

export function ItSignModal({ bonId, reference, pdfType, description, onClose, onSigned }: ItSignModalProps) {
  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } =
    useSignatureCanvas();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const dataUrl = getDataUrl();
    if (!dataUrl) {
      setError('Veuillez tracer votre signature avant de valider.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bons/${bonId}/sign-it`, { signatureDataUrl: dataUrl, pdfType });
      await onSigned();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la signature IT';
      setError(msg);
      setSubmitting(false);
    }
  };

  const typLabel = pdfType === 'restitution' ? 'restitution' : 'mise à disposition';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Dark header */}
        <div className="bg-slate-800 dark:bg-slate-900 px-5 py-4 flex items-center gap-3">
          <Stamp className="h-5 w-5 text-slate-300 dark:text-slate-400" />
          <div>
            <DialogHeader className="p-0 text-left">
              <DialogTitle className="text-white text-sm">
                Cachet du service informatique
              </DialogTitle>
              <DialogDescription className="text-muted-foreground/70 text-xs">
                {typLabel.charAt(0).toUpperCase() + typLabel.slice(1)} &middot;{' '}
                <span className="font-mono">{reference}</span>
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          {/* Signature canvas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Votre signature / cachet
              </label>
              <button
                type="button"
                onClick={clear}
                className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground"
              >
                <Trash2 className="h-3 w-3" /> Effacer
              </button>
            </div>
            <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/40 hover:border-primary/50 transition-colors touch-none">
              <canvas
                ref={canvasRef}
                width={600}
                height={150}
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

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white"
              onClick={handleSubmit}
              disabled={submitting || isEmpty}
            >
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> En cours&hellip;</>
              ) : (
                <><Pen className="h-3.5 w-3.5" /> Apposer et continuer</>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
