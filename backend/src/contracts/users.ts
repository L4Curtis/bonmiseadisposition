/**
 * Contrats de l'API — annuaire des utilisateurs (`src/users/`) et actions
 * d'administration sur un compte (`src/admin/admin.controller.ts`).
 *
 * Gestion des comptes réservée à l'administrateur. L'IT (admin, technicien)
 * garde les lectures utiles aux bons : GET /users/search (destinataire d'un
 * bon), GET /users/it-staff (filtre « Créé par ») et GET /users/:id.
 */

import type { IsoDateTime, UserRole } from './common';
import type { FilialeSummary } from './filiales';

/**
 * Utilisateur tel que renvoyé par l'annuaire (`safeSelect` de
 * UsersService) : toutes les colonnes utiles, sans `passwordHash` ni
 * `passwordChangedAt`, avec l'identité de sa filiale.
 */
export interface User {
  id: string;
  samAccountName: string;
  displayName: string;
  /** `null` pour un compte manuel créé sans adresse. */
  email: string | null;
  department: string | null;
  company: string | null;
  title: string | null;
  filialeId: string | null;
  filiale: FilialeSummary | null;
  isItStaff: boolean;
  role: UserRole;
  isLocalAccount: boolean;
  isManualAccount: boolean;
  mustChangePassword: boolean;
  active: boolean;
  lastLdapSync: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Paramètres de GET /users. `role` doit être une valeur de `UserRole`
 * (sinon 400). `page` fait basculer la réponse vers l'enveloppe paginée ;
 * `limit` (1 à 100, 20 par défaut) et `search` ne sont lus qu'avec `page`.
 */
export interface UsersListQuery {
  filialeId?: string;
  role?: UserRole;
  page?: string;
  limit?: string;
  search?: string;
}

/**
 * GET /users (sans `page`) — tableau nu de tous les utilisateurs ACTIFS,
 * triés par `displayName`, filtrés par `filialeId` et `role` s'ils sont
 * fournis (administrateur). Même route que l'écran Utilisateurs, autre forme :
 * seule la présence de `page` fait passer à l'enveloppe paginée.
 */
export type UserListResponse = User[];

/**
 * GET /users?page=&limit= — enveloppe paginée des utilisateurs actifs,
 * avec recherche facultative (`search`) sur le nom, l'email et
 * l'identifiant. `page` et `limit` renvoient les valeurs demandées, en nombre.
 */
export interface UserPageResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

/** GET /users/search?q= — 15 utilisateurs actifs au plus, triés par
 *  `displayName`, dont le nom, l'email ou l'identifiant contient `q`. */
export type UserSearchResponse = User[];

/**
 * GET /users/:id — l'utilisateur, actif ou non (404 s'il n'existe pas).
 * POST /users/manual (201) — le compte manuel créé (`isManualAccount: true`,
 * `role: 'collaborator'`).
 * PATCH /users/:id/manual — le compte manuel modifié, ou relu tel quel si
 * aucun champ n'a changé.
 */
export type UserResponse = User;

/** Administrateur ou technicien actif, tel que proposé par le filtre
 *  « Créé par » de la liste des bons. */
export interface ItStaffMember {
  id: string;
  displayName: string;
}

/** GET /users/it-staff — administrateurs et techniciens actifs, triés par
 *  `displayName` (IT). */
export type ItStaffResponse = ItStaffMember[];

/** Issue du traitement d'une ligne d'import. */
export type ManualUserImportStatus = 'created' | 'updated' | 'skipped' | 'error';

/**
 * Compte rendu d'une ligne d'import, dans l'ordre du tableau envoyé.
 * Les clés facultatives n'apparaissent que lorsque la ligne a pu les
 * renseigner : `message` accompagne toujours `error` et `skipped`, jamais
 * `created` ni `updated` (qui portent `samAccountName` et `displayName`) ;
 * une ligne rejetée ou ignorée peut n'avoir ni l'un ni l'autre.
 */
export interface ManualUserImportLine {
  index: number;
  status: ManualUserImportStatus;
  samAccountName?: string;
  displayName?: string;
  message?: string;
}

/** Ligne rejetée d'un import (reprise des lignes `error` de `lines`). */
export interface ManualUserImportError {
  index: number;
  message: string;
}

/** POST /users/manual/import (201) — compte rendu de l'import en masse des
 *  comptes manuels. */
export interface ManualUsersImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ManualUserImportError[];
  lines: ManualUserImportLine[];
}

/** PATCH /admin/users/:id/role — nouveau rôle et indicateur IT recalculé. */
export interface ChangeUserRoleResponse {
  id: string;
  role: UserRole;
  isItStaff: boolean;
}

/**
 * POST /admin/users/:id/unlock (201) — `unlocked` vaut toujours `true` ;
 * `removed` compte les échecs de connexion locale des 30 dernières minutes
 * supprimés (0 si le compte n'était pas verrouillé).
 */
export interface UnlockUserResponse {
  unlocked: true;
  removed: number;
}
