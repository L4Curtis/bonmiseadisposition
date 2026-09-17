import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Filiale } from '@/types';

interface DeleteFilialeDialogProps {
  deleteTarget: Filiale | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteFilialeDialog({ deleteTarget, onOpenChange, onConfirm }: DeleteFilialeDialogProps) {
  return (
    <Dialog open={deleteTarget !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer cette filiale</DialogTitle>
          <DialogDescription>
            Voulez-vous vraiment supprimer la filiale &laquo;&nbsp;{deleteTarget?.displayName}&nbsp;&raquo; ?
            Cette action est irreversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
