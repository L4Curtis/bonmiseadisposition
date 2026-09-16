import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
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
