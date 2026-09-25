// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/auth.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — authentification (`src/auth/auth.controller.ts`,
 * `src/auth/strategies/jwt.strategy.ts`).
 *
 * Les jetons circulent uniquement dans des cookies httpOnly
 * (`access_token`, `refresh_token`) : aucune réponse ne les contient.
 * Les routes POST de ce contrôleur écrivent la réponse elles-mêmes
 * (`res.json`) sans fixer le statut : elles répondent 201, statut par défaut
 * d'un POST dans NestJS, comme les autres créations.
 */

import type { IsoDateTime, OkResponse, UserRole } from './common';

/** Filiale du compte connecté, réduite à son identité. */
export interface AuthMeFiliale {
  id: string;
  name: string;
  displayName: string;
}

/**
 * GET /auth/me — utilisateur connecté, tel que construit par
 * JwtStrategy.validate() : le `select` complet de la stratégie, plus
 * `mustChangePassword` recalculé (indicateur en base OU mot de passe local de
 * plus de 90 jours). Contrairement à GET /users, cette forme n'a ni
 * `isManualAccount`, ni `lastLdapSync`, ni `createdAt`/`updatedAt`, mais
 * contient `passwordChangedAt`.
 */
export interface AuthMeResponse {
  id: string;
  samAccountName: string;
  displayName: string;
  /** Colonne facultative en base ; un compte capable de se connecter en a
   *  normalement une. */
  email: string | null;
  department: string | null;
  company: string | null;
  title: string | null;
  filialeId: string | null;
  /** Identité de la filiale, sans cachet ni adresse. */
  filiale: AuthMeFiliale | null;
  isItStaff: boolean;
  role: UserRole;
  isLocalAccount: boolean;
  /** Valeur effective, recalculée à chaque requête. */
  mustChangePassword: boolean;
  passwordChangedAt: IsoDateTime | null;
  /** Toujours `true` : un compte inactif est refusé (401) avant d'arriver ici. */
  active: boolean;
}

/** GET /auth/setup-required — `true` tant qu'aucun admin local actif
 *  n'existe et que la configuration est vide (premier démarrage). */
export interface SetupRequiredResponse {
  setupRequired: boolean;
}

/** GET /auth/local-auth-status — `false` seulement si la configuration
 *  `general.local_auth_enabled` vaut exactement « false ». */
export interface LocalAuthStatusResponse {
  enabled: boolean;
}

/**
 * POST /auth/local-login (201) — connexion réussie, cookies posés.
 * `mustChangePassword` indique qu'il faut changer le mot de passe avant
 * toute autre action (le serveur refuse sinon en 403).
 * Échecs au format `NestErrorBody` : 401 pour un compte verrouillé, 403 si
 * l'authentification locale est désactivée, 400 pour un corps invalide.
 */
export interface LocalLoginResponse {
  ok: true;
  mustChangePassword: boolean;
}

/** POST /auth/refresh (201) — nouveaux cookies posés ; 401 sans cookie
 *  `refresh_token`. */
export type RefreshResponse = OkResponse;

/** POST /auth/logout (201) — jetons révoqués et cookies effacés. */
export type LogoutResponse = OkResponse;

/** POST /auth/change-password (201) — mot de passe changé, nouveaux cookies
 *  posés pour que la session en cours continue. */
export type ChangePasswordResponse = OkResponse;
