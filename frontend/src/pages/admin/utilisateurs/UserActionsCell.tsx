import { Button } from '@/components/ui/button';
import { LockOpen, Pencil, Power } from 'lucide-react';
import type { User } from '@/types';
import type { UserRow } from './types';
import { accountOrigin, canToggleActive } from './account-origin';

/** Cible tactile de 44 px sur téléphone, taille compacte à partir de 640 px. */
const TOUCH = 'h-11 sm:h-8 gap-1.5';

export interface UserActionsCellProps {
  readonly user: UserRow;
  readonly currentUserId?: string;
  readonly directoryActive: boolean;
  readonly unlockingId: string | null;
  readonly onUnlock: (user: User) => void;
  readonly onEdit: (user: User) => void;
  readonly togglingActiveId: string | null;
  readonly onToggleActive: (user: User) => void;
}

/**
 * Actions d'un compte : déverrouillage (compte local verrouillé seulement),
 * modification (compte
 * créé à la main), désactivation et réactivation (tout compte, sauf un compte
 * de l'annuaire quand l'annuaire synchronise : une phrase renvoie alors vers
 * Active Directory).
 */
export function UserActionsCell({
  user, currentUserId, directoryActive, unlockingId, onUnlock, onEdit, togglingActiveId, onToggleActive,
}: UserActionsCellProps) {
  const origin = accountOrigin(user);
  const canToggle = canToggleActive(user, directoryActive, currentUserId);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {origin === 'local' && user.lockedUntil && (
        <Button
          variant="outline"
          size="sm"
          className={TOUCH}
          disabled={unlockingId === user.id}
          onClick={() => onUnlock(user)}
          aria-label={`Déverrouiller le compte de ${user.displayName}`}
        >
          <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
          {unlockingId === user.id ? 'Déverrouillage…' : 'Déverrouiller'}
        </Button>
      )}
      {origin === 'manual' && (
        <Button variant="outline" size="sm" className={TOUCH} onClick={() => onEdit(user)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Modifier
        </Button>
      )}
      {canToggle && (
        <Button
          variant="outline"
          size="sm"
          className={TOUCH}
          disabled={togglingActiveId === user.id}
          onClick={() => onToggleActive(user)}
          aria-label={`${user.active ? 'Désactiver' : 'Réactiver'} le compte de ${user.displayName}`}
        >
          <Power className="h-3.5 w-3.5" aria-hidden="true" />
          {user.active ? 'Désactiver' : 'Réactiver'}
        </Button>
      )}
      {origin === 'directory' && directoryActive && (
        <p className="text-xs text-muted-foreground">
          Compte Active Directory : se modifie et se désactive dans Active Directory
        </p>
      )}
    </div>
  );
}
