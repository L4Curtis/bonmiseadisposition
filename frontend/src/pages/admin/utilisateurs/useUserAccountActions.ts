import { useState } from 'react';
import { api, hasErrorCode } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/dates';
import type { ChangeUserRoleResponse, UnlockUserResponse } from '@/contracts/users';
import type { User, UserRole } from '@/types';
import type { UsersList } from './useUsersList';

export interface UserAccountActions {
  readonly updatingRoleId: string | null;
  readonly unlockingId: string | null;
  readonly togglingActiveId: string | null;
  /** Compte dont la désactivation attend la confirmation de l'administrateur. */
  readonly deactivateTarget: User | null;
  readonly setDeactivateTarget: (user: User | null) => void;
  readonly changeRole: (user: User, role: UserRole) => Promise<void>;
  readonly unlock: (user: User) => Promise<void>;
  /** Réactive tout de suite ; une désactivation passe par la confirmation. */
  readonly toggleActive: (user: User) => void;
  readonly confirmDeactivate: () => Promise<void>;
}

/**
 * Ce que le déverrouillage a réellement levé. Le verrou du compte tombe ; le
 * verrou du poste d'où venaient les essais (30 échecs, tous comptes
 * confondus) reste posé : tant qu'il l'est, la personne ne peut pas se
 * reconnecter depuis ce poste, et le message ne doit pas dire le contraire.
 * La limite de débit (5 essais par minute et par poste) tombe d'elle-même en
 * une minute au plus.
 */
export function unlockedMessage(displayName: string, res: UnlockUserResponse): string {
  if (res.stationLockedUntil) {
    return `Le compte de ${displayName} est déverrouillé, mais le poste d'où venaient les essais reste bloqué `
      + `jusqu'à ${formatTime(res.stationLockedUntil)} (trop d'échecs depuis ce poste, tous comptes confondus). `
      + "D'ici là, se connecter depuis un autre poste.";
  }
  return `${displayName} peut se reconnecter (patienter une minute en cas de message « Trop de requêtes »).`;
}

/**
 * Actions de l'administrateur sur un compte de l'écran Utilisateurs : rôle
 * (PATCH /users/:id/role), déverrouillage (POST /users/:id/unlock),
 * désactivation et réactivation (POST /users/:id/deactivate|reactivate).
 */
export function useUserAccountActions(list: Pick<UsersList, 'replaceUser' | 'reload'>): UserAccountActions {
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const changeRole = async (target: User, role: UserRole): Promise<void> => {
    if (role === target.role) return;
    setUpdatingRoleId(target.id);
    // Mise à jour optimiste, annulée si le serveur refuse.
    list.replaceUser(target.id, (u) => ({ ...u, role }));
    try {
      const result = await api.patch<ChangeUserRoleResponse>(`/users/${target.id}/role`, { role });
      list.replaceUser(target.id, (u) => ({ ...u, role: result.role, isItStaff: result.isItStaff }));
      toast({ title: 'Rôle mis à jour', variant: 'success' });
    } catch (e: unknown) {
      list.replaceUser(target.id, (u) => ({ ...u, role: target.role, isItStaff: target.isItStaff }));
      showActionError(e, 'Erreur lors de la mise à jour du rôle');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const unlock = async (target: User): Promise<void> => {
    setUnlockingId(target.id);
    try {
      const res = await api.post<UnlockUserResponse>(`/users/${target.id}/unlock`);
      list.replaceUser(target.id, (u) => ({ ...u, lockedUntil: null }));
      toast({ title: 'Compte déverrouillé', description: unlockedMessage(target.displayName, res), variant: 'success' });
    } catch (e: unknown) {
      if (hasErrorCode(e, 'not_locked')) {
        // Le verrou est tombé seul (30 minutes) ou un autre administrateur
        // l'a levé : la liste est relue pour montrer l'état réel.
        toast({ title: 'Compte déjà déverrouillé', description: e.message });
        list.reload();
      } else {
        showActionError(e, 'Erreur lors du déverrouillage');
      }
    } finally {
      setUnlockingId(null);
    }
  };

  const setActive = async (target: User, active: boolean): Promise<void> => {
    setTogglingActiveId(target.id);
    try {
      const updated = await api.post<User>(`/users/${target.id}/${active ? 'reactivate' : 'deactivate'}`);
      list.replaceUser(target.id, (u) => ({ ...u, active: updated.active }));
      toast({ title: active ? 'Compte réactivé' : 'Compte désactivé', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, active ? 'Erreur lors de la réactivation' : 'Erreur lors de la désactivation');
      // L'annuaire a été activé entre-temps : la liste dit de nouveau qui
      // peut être désactivé ici.
      if (hasErrorCode(e, 'directory_active')) list.reload();
    } finally {
      setTogglingActiveId(null);
    }
  };

  const toggleActive = (target: User): void => {
    if (target.active) {
      setDeactivateTarget(target);
      return;
    }
    void setActive(target, true);
  };

  // La fenêtre reste ouverte, boutons désactivés, le temps de la réponse.
  const confirmDeactivate = async (): Promise<void> => {
    if (!deactivateTarget) return;
    await setActive(deactivateTarget, false);
    setDeactivateTarget(null);
  };

  return {
    updatingRoleId,
    unlockingId,
    togglingActiveId,
    deactivateTarget,
    setDeactivateTarget,
    changeRole,
    unlock,
    toggleActive,
    confirmDeactivate,
  };
}
