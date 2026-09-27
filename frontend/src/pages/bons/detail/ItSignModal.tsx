import { useState } from 'react';
import { Loader2, Pen, Stamp, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';

interface ItSignModalProps {
  bonId: string;
  reference: string;
  pdfType: 'mise_disposition' | 'restitution';
  description: string;
  onClose: () => void;
  onSigned: () => Promise<void>;
}

const DOCUMENT_TITLES = { mise_disposition: 'Remise', restitution: 'Restitution' } as const;

/**
 * Signature IT d'un document, avant que son lien parte (R-022). Au doigt :
 * fenêtre plein écran sur téléphone, cadre de signature haut, boutons de
 * 44 px au moins, « Effacer » facile à atteindre.
 */
export function ItSignModal({ bonId, reference, pdfType, description, onClose, onSigned }: ItSignModalProps) {
  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } =
    useSignatureCanvas();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const dataUrl = getDataUrl();
    if (!dataUrl) {
      setError('Tracez votre signature avant de valider.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/bons/${bonId}/sign-it`, { signatureDataUrl: dataUrl, pdfType });
      await onSigned();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Erreur lors de la signature IT'));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className={`overflow-hidden p-0 sm:max-w-lg ${PHONE_FULLSCREEN_DIALOG}`}>
        <div className="flex items-center gap-3 bg-primary px-5 py-4 pr-12">
          <Stamp className="h-5 w-5 shrink-0 text-primary-foreground/70" aria-hidden="true" />
          <DialogHeader className="p-0 text-left">
            <DialogTitle className="text-sm text-primary-foreground">Signature IT</DialogTitle>
            <DialogDescription className="text-xs text-primary-foreground/80">
              {DOCUMENT_TITLES[pdfType]} · <span className="font-mono">{reference}</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Votre signature</span>
              <button
                type="button"
                onClick={clear}
                className="flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground/80 hover:text-muted-foreground sm:min-h-0"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Effacer
              </button>
            </div>
            <div className="relative touch-none rounded-lg border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/50">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                aria-label="Zone de signature"
                className="block h-[200px] w-full cursor-crosshair text-foreground sm:h-[150px]"
                style={{ touchAction: 'none' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
              />
              {isEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="select-none text-sm text-muted-foreground/40">Signez ici&hellip;</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className={`pt-1 ${TOUCH_FOOTER}`}>
            <Button variant="outline" size="sm" className={`flex-1 ${TOUCH_BUTTON}`} onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button size="sm" className={`flex-1 ${TOUCH_BUTTON}`} onClick={handleSubmit} disabled={submitting || isEmpty}>
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> En cours&hellip;</>
                : <><Pen className="h-3.5 w-3.5" aria-hidden="true" /> Signer et continuer</>}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
