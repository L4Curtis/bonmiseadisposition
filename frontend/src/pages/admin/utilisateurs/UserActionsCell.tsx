import { Button } from '@/components/ui/button';
import { LockOpen, Pencil, Power } from 'lucide-react';
import type { User } from '@/types';

interface UserActionsCellProps {
  readonly user: User;
  readonly unlockingId: string | null;
  readonly onUnlock: (user: User) => void;
  readonly onEdit: (user: User) => void;
  readonly togglingActiveId: string | null;
  readonly onToggleActive: (user: User) => void;
}

/** Actions de la ligne « Utilisateurs » : déverrouillage (compte local),
 *  modification + activation/désactivation (compte manuel uniquement). Un
 *  compte d'annuaire ne peut pas être modifié ici — phrase explicative
 *  renvoyant vers Active Directory. */
export function UserActionsCell({
  user, unlockingId, onUnlock, onEdit, togglingActiveId, onToggleActive,
}: UserActionsCellProps) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      {user.isLocalAccount && (
        <Button
          variant="outline"
          size="sm"
          disabled={unlockingId === user.id}
          onClick={() => onUnlock(user)}
          className="gap-1.5"
        >
          <LockOpen className="h-3.5 w-3.5" />
          {unlockingId === user.id ? 'Déverrouillage...' : 'Déverrouiller'}
        </Button>
      )}

      {user.isManualAccount && (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onEdit(user)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={togglingActiveId === user.id}
            onClick={() => onToggleActive(user)}
            className="gap-1.5"
          >
            <Power className="h-3.5 w-3.5" />
            {user.active ? 'Désactiver' : 'Activer'}
          </Button>
        </div>
      )}

      {!user.isManualAccount && !user.isLocalAccount && (
        <p className="text-[11px] text-muted-foreground/70">
          Compte Active Directory : modifiable dans Active Directory
        </p>
      )}
    </div>
  );
}
