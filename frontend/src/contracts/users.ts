// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/users.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — utilisateurs (`src/users/`) : annuaire, comptes créés à
 * la main et actions d'administration sur un compte (rôle, déverrouillage,
 * désactivation).
 *
 * Gestion des comptes réservée à l'administrateur. L'IT (admin, technicien)
 * garde les lectures utiles aux bons : GET /users/search (destinataire d'un
 * bon), GET /users/it-staff (filtre « Créé par ») et GET /users/:id.
 */

import type { Civilite, IsoDateTime, ListResponse, PageSize, UserRole } from './common';
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
  /** Civilité retenue sur le compte : choisie par le technicien à la création
   *  d'un bon, reproposée aux bons suivants. `null` tant qu'aucun bon ne l'a
   *  fixée. */
  civilite: Civilite | null;
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

/** Filtre d'état de GET /users : comptes actifs (défaut), inactifs ou tous. */
export type UserStatusFilter = 'active' | 'inactive' | 'all';

/** Origine d'un compte : créé à la main (compagnon de chantier), compte local
 *  de l'application, ou venu de l'annuaire (Active Directory, SSO). */
export type UserOrigin = 'manual' | 'local' | 'directory';

/**
 * Paramètres de GET /users (validés : 400 `validation_failed` hors bornes).
 * `search` porte sur le nom, l'email et l'identifiant ; `origin` retient les
 * comptes d'une seule origine (l'écran compte ainsi les comptes créés à la
 * main avant de les exporter).
 */
export interface UsersListQuery {
  page?: number;
  limit?: PageSize;
  search?: string;
  status?: UserStatusFilter;
  origin?: UserOrigin;
  role?: UserRole;
  filialeId?: string;
}

/** Données annexes de GET /users. */
export interface UserPageMeta {
  /** L'annuaire (Active Directory) synchronise les comptes : réglage coché ET
   *  adresse renseignée. Faux : l'administrateur désactive lui-même un compte
   *  venu de l'annuaire (POST /users/:id/deactivate). */
  directoryActive: boolean;
}

/**
 * Compte d'une page de GET /users : l'utilisateur et l'état du verrou de sa
 * connexion locale. `lockedUntil` : fin du verrou anti force brute (au moins
 * 10 échecs depuis un même poste en 30 minutes, comptés depuis le dernier
 * déverrouillage), calculée comme à la connexion ; `null` si le compte n'est
 * pas verrouillé, et toujours pour un compte qui n'est pas local.
 */
export interface UserListItem extends User {
  lockedUntil: IsoDateTime | null;
}

/** GET /users — page de l'écran Utilisateurs, triée par `displayName`. */
export type UserPageResponse = ListResponse<UserListItem, UserPageMeta>;

/** GET /users/search?q= — 15 utilisateurs actifs au plus, triés par
 *  `displayName`, dont le nom, l'email ou l'identifiant contient `q` ;
 *  `truncated` : il y en a d'autres, la recherche doit être précisée. */
export type UserSearchResponse = ListResponse<User>;

/**
 * GET /users/:id — l'utilisateur, actif ou non (404 s'il n'existe pas).
 * POST /users/manual (201) — le compte manuel créé (`isManualAccount: true`,
 * `role: 'collaborator'`).
 * PATCH /users/:id/manual — le compte manuel modifié, ou relu tel quel si
 * aucun champ n'a changé.
 * POST /users/:id/deactivate, POST /users/:id/reactivate — le compte, avec son
 * nouvel état (relu tel quel s'il y était déjà).
 */
export type UserResponse = User;

/** Administrateur ou technicien actif, tel que proposé par le filtre
 *  « Créé par » de la liste des bons. */
export interface ItStaffMember {
  id: string;
  displayName: string;
}

/** GET /users/it-staff — administrateurs et techniciens actifs, triés par
 *  `displayName` (IT), en une seule page. */
export type ItStaffResponse = ListResponse<ItStaffMember>;

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

/** PATCH /users/:id/role (ancien chemin PATCH /admin/users/:id/role, alias
 *  déprécié) — nouveau rôle et indicateur IT recalculé. */
export interface ChangeUserRoleResponse {
  id: string;
  role: UserRole;
  isItStaff: boolean;
}

/**
 * POST /users/:id/unlock (ancien chemin POST /admin/users/:id/unlock, alias
 * déprécié) — le verrou du compte est levé (409 `not_locked` s'il n'était pas
 * verrouillé). Rien n'est effacé du journal : `failedAttempts` compte les
 * échecs qui ne comptent plus.
 *
 * Le déverrouillage ne lève PAS le verrou d'un poste (30 échecs depuis une
 * même adresse en 30 minutes, tous comptes confondus) : `stationLockedUntil`
 * donne la fin du verrou le plus tardif parmi les postes d'où venaient les
 * échecs de ce compte, `null` si aucun n'est verrouillé. Il ne lève pas non
 * plus la limite de débit de la connexion (5 essais par minute et par poste,
 * réponse 429), qui tombe d'elle-même au bout d'une minute.
 */
export interface UnlockUserResponse {
  unlocked: true;
  failedAttempts: number;
  stationLockedUntil: IsoDateTime | null;
}

/**
 * Codes d'erreur propres aux utilisateurs (en plus de `CommonApiErrorCode`) :
 *  - `own_account` (400) : un administrateur ne change ni son propre rôle ni
 *    ne désactive son propre compte ;
 *  - `last_admin` (409) : il doit rester un administrateur actif ;
 *  - `directory_active` (409) : l'annuaire synchronise ce compte, il se
 *    désactive dans Active Directory ;
 *  - `directory_account` (400) : un compte d'annuaire ne se modifie pas ici ;
 *  - `email_taken` (409) : adresse déjà portée par un autre compte ;
 *  - `filiale_unavailable` (400) : filiale introuvable ou inactive ;
 *  - `no_local_login` (400) : compte sans adresse, rien à déverrouiller ;
 *  - `not_locked` (409) : le compte n'est pas verrouillé, rien à lever.
 */
export type UserErrorCode =
  | 'own_account'
  | 'last_admin'
  | 'directory_active'
  | 'directory_account'
  | 'email_taken'
  | 'filiale_unavailable'
  | 'no_local_login'
  | 'not_locked';
