import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { User } from '@/types';
import { accountOrigin } from './account-origin';

interface DeactivateUserDialogProps {
  readonly target: User | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  /** Désactivation en cours : boutons désactivés. */
  readonly loading: boolean;
}

/** Confirmation avant de désactiver un compte : ce qu'il ne pourra plus faire,
 *  et, pour un compte de l'annuaire, que la désactivation se fait ici parce que
 *  l'annuaire est inactif. */
export function DeactivateUserDialog({ target, onCancel, onConfirm, loading }: DeactivateUserDialogProps) {
  const fromDirectory = target !== null && accountOrigin(target) === 'directory';
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Désactiver le compte de {target?.displayName}</DialogTitle>
          <DialogDescription>
            Cette personne ne pourra plus se connecter ni être choisie comme destinataire d'un nouveau bon.
            Ses bons existants restent consultables. Vous pourrez réactiver le compte à tout moment.
          </DialogDescription>
        </DialogHeader>
        {fromDirectory && (
          <p className="text-sm text-muted-foreground">
            Ce compte vient d'Active Directory. L'annuaire n'étant pas synchronisé, la désactivation se fait ici ;
            si la synchronisation est activée plus tard, c'est Active Directory qui fera foi.
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 sm:h-9" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button variant="destructive" className="h-11 sm:h-9" onClick={onConfirm} disabled={loading}>
            {loading ? 'Désactivation…' : 'Désactiver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
