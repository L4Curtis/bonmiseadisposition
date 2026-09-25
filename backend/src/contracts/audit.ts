/**
 * Contrats de l'API — journal d'audit (`backend/src/audit/`).
 *
 * Accès : admin uniquement. L'export CSV (`GET /api/audit/export`) ne renvoie
 * pas de JSON et n'est donc pas décrit ici.
 */

import type { IsoDateTime, JsonValue } from './common';

/** Bon concerné par l'entrée. */
export interface AuditLogBonRef {
  id: string;
  reference: string;
}

/** Auteur lié par la relation `user` (colonne `user_id` renseignée). */
export interface AuditLogUserRelation {
  id: string;
  displayName: string;
  email: string | null;
  /** Jamais présent sur une vraie relation. */
  resolved?: never;
}

/** Auteur déduit de `userEmail` quand l'entrée n'a pas de relation `user` mais
 *  qu'un compte porte cet email : `id` est alors `null` et `resolved` vaut `true`. */
export interface AuditLogResolvedUser {
  id: null;
  displayName: string;
  /** Copie de `userEmail` de l'entrée (casse d'origine). */
  email: string;
  resolved: true;
}

/** Auteur d'une entrée : relation réelle, nom déduit de l'email, ou `null`
 *  (aucune relation et email inconnu ou absent). */
export type AuditLogUser = AuditLogUserRelation | AuditLogResolvedUser;

/** Une entrée du journal : toutes les colonnes de `AuditLog` plus les
 *  relations `bon` et `user`. */
export interface AuditLogEntry {
  id: string;
  bonId: string | null;
  userId: string | null;
  userEmail: string | null;
  action: string;
  /** Colonne `Json` facultative : forme libre selon `action`. */
  details: JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: IsoDateTime;
  bon: AuditLogBonRef | null;
  user: AuditLogUser | null;
}

/** GET /api/audit — liste paginée, les plus récentes d'abord (filtres `bonId`,
 *  `user`, `userEmail`, `action`, `dateFrom`, `dateTo`). `limit` vaut 50 par
 *  défaut, 100 au plus. `exportTruncated` annonce qu'un export avec les mêmes
 *  filtres serait tronqué à `exportLimit` lignes (10 000). Date invalide : 400. */
export interface AuditListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  exportLimit: number;
  exportTruncated: boolean;
}

/** GET /api/audit/actions — actions distinctes présentes en base, triées par
 *  ordre alphabétique. */
export type AuditActionsResponse = string[];
