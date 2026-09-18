import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { DeactivateTarget, Pack, RemovePackItemTarget } from './types';

interface CatalogueDialogsProps {
  deactivateTarget: DeactivateTarget | null;
  onCancelDeactivate: () => void;
  onConfirmDeactivate: () => void;
  deactivating: boolean;
  removePackItemTarget: RemovePackItemTarget | null;
  onCancelRemovePackItem: () => void;
  onConfirmRemovePackItem: () => void;
  removingPackItem: boolean;
  duplicateTarget: Pack | null;
  duplicateName: string;
  onDuplicateNameChange: (value: string) => void;
  onCancelDuplicate: () => void;
  onConfirmDuplicate: () => void;
  duplicating: boolean;
}

/** Boîtes de dialogue du catalogue : désactivation d'un équipement/pack,
 *  retrait d'un équipement d'un pack, et duplication d'un pack. */
export function CatalogueDialogs({
  deactivateTarget, onCancelDeactivate, onConfirmDeactivate, deactivating,
  removePackItemTarget, onCancelRemovePackItem, onConfirmRemovePackItem, removingPackItem,
  duplicateTarget, duplicateName, onDuplicateNameChange, onCancelDuplicate, onConfirmDuplicate, duplicating,
}: CatalogueDialogsProps) {
  return (
    <>
      <Dialog open={deactivateTarget !== null} onOpenChange={(open) => { if (!open) onCancelDeactivate(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Désactiver {deactivateTarget?.type === 'pack' ? 'ce pack' : 'cet équipement'}
            </DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment désactiver &laquo;&nbsp;{deactivateTarget?.label}&nbsp;&raquo; ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelDeactivate} disabled={deactivating}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={onConfirmDeactivate} disabled={deactivating}>
              Désactiver
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
            <Button variant="outline" onClick={onCancelRemovePackItem} disabled={removingPackItem}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={onConfirmRemovePackItem} disabled={removingPackItem}>
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateTarget !== null} onOpenChange={(open) => { if (!open) onCancelDuplicate(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dupliquer ce pack</DialogTitle>
            <DialogDescription>
              Crée un nouveau pack avec les mêmes équipements que
              &nbsp;&laquo;&nbsp;{duplicateTarget?.name}&nbsp;&raquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="duplicate-pack-name">Nom du nouveau pack</Label>
            <Input
              id="duplicate-pack-name"
              value={duplicateName}
              onChange={(e) => onDuplicateNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onConfirmDuplicate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelDuplicate} disabled={duplicating}>
              Annuler
            </Button>
            <Button onClick={onConfirmDuplicate} disabled={duplicating || !duplicateName.trim()}>
              Dupliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
