import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CloseUnilateralModalProps {
  /** Libellé du résultat selon le statut courant (actif / archivé). */
  readonly outcomeLabel: string;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
  readonly loading: boolean;
}

const MIN_REASON_LENGTH = 10;

export function CloseUnilateralModal({ outcomeLabel, onConfirm, onCancel, loading }: CloseUnilateralModalProps) {
  const [reason, setReason] = useState('');
  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Clôturer sans signature ?
          </DialogTitle>
          <DialogDescription>
            Le bon sera {outcomeLabel} <strong>sans signature du collaborateur</strong>.
            La mention « constaté sans signature » et votre motif figureront sur le document
            PDF, et l'action est tracée dans le journal d'audit. Le collaborateur sera
            informé par email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="close-unilateral-reason">Motif (obligatoire)</Label>
          <textarea
            id="close-unilateral-reason"
            className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            placeholder="Ex: Collaborateur parti de l'entreprise le 30/05, injoignable après 3 relances."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
          {!reasonValid && reason.length > 0 && (
            <p className="text-xs text-amber-600">Le motif doit faire au moins {MIN_REASON_LENGTH} caractères.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || !reasonValid}
          >
            {loading ? 'Clôture en cours…' : 'Clôturer sans signature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
