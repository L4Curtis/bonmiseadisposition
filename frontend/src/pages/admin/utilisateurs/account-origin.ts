import type { User } from '@/types';

/** Origine d'un compte : créé à la main (compagnon de chantier), compte local
 *  de l'application, ou venu de l'annuaire (Active Directory, SSO). */
export type AccountOrigin = 'manual' | 'local' | 'directory';

export function accountOrigin(user: Pick<User, 'isManualAccount' | 'isLocalAccount'>): AccountOrigin {
  if (user.isManualAccount) return 'manual';
  if (user.isLocalAccount) return 'local';
  return 'directory';
}

/** L'administrateur peut-il désactiver ou réactiver ce compte ici ? Toujours,
 *  sauf un compte de l'annuaire quand l'annuaire synchronise les comptes : il
 *  se désactive alors dans Active Directory. Jamais son propre compte. */
export function canToggleActive(user: User, directoryActive: boolean, currentUserId: string | undefined): boolean {
  if (user.id === currentUserId) return false;
  return accountOrigin(user) !== 'directory' || !directoryActive;
}
