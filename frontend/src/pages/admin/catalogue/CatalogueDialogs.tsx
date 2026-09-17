import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DeleteTarget, RemovePackItemTarget } from './types';

interface CatalogueDialogsProps {
  deleteTarget: DeleteTarget | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  removePackItemTarget: RemovePackItemTarget | null;
  onCancelRemovePackItem: () => void;
  onConfirmRemovePackItem: () => void;
}

/** Boites de confirmation du catalogue : desactivation d'un equipement/pack,
 *  et retrait d'un equipement d'un pack. */
export function CatalogueDialogs({
  deleteTarget, onCancelDelete, onConfirmDelete,
  removePackItemTarget, onCancelRemovePackItem, onConfirmRemovePackItem,
}: CatalogueDialogsProps) {
  return (
    <>
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) onCancelDelete(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Desactiver {deleteTarget?.type === 'pack' ? 'ce pack' : 'cet equipement'}
            </DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment desactiver &laquo;&nbsp;{deleteTarget?.label}&nbsp;&raquo; ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelDelete}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete}>
              Desactiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removePackItemTarget !== null} onOpenChange={(open) => { if (!open) onCancelRemovePackItem(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer cet équipement du pack</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment retirer &laquo;&nbsp;{removePackItemTarget?.label}&nbsp;&raquo; du pack
              &laquo;&nbsp;{removePackItemTarget?.pack.name}&nbsp;&raquo; ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelRemovePackItem}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={onConfirmRemovePackItem}>
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
