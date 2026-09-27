import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PHONE_FULLSCREEN_DIALOG, TOUCH_BUTTON, TOUCH_FOOTER } from './dialog-layout';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  /** Désactive les boutons pendant l'action (anti double-clic). */
  loading?: boolean;
  /** Libellé du bouton de confirmation (par défaut « Confirmer »). */
  confirmLabel?: string;
}

export function ConfirmModal({ title, message, onConfirm, onCancel, danger, loading, confirmLabel }: ConfirmModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent className={`sm:max-w-sm ${PHONE_FULLSCREEN_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className={TOUCH_FOOTER}>
          <Button variant="outline" size="sm" className={TOUCH_BUTTON} onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            className={TOUCH_BUTTON}
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'En cours…' : (confirmLabel ?? 'Confirmer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
