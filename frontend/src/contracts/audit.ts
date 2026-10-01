// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/audit.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — journal d'audit (`backend/src/audit/`).
 *
 * Accès : admin uniquement. L'écran affiche, pour chaque entrée, le libellé et
 * la phrase du catalogue (`audit-actions.ts` : `AUDIT_ACTIONS`,
 * `fillAuditSentence`), jamais les clés brutes de `details`.
 *
 * L'export CSV (`GET /api/audit/export`, mêmes filtres que la liste) ne
 * renvoie pas de JSON : colonnes « Date » (JJ/MM/AAAA HH:MM, heure de Paris),
 * « Action » (libellé), « Description » (phrase, sans données personnelles),
 * « Auteur », « Email de l'auteur », « Bon ». En-tête `X-Truncated: true` au-delà
 * de `exportLimit` lignes. Débit limité (10 par minute).
 */

import type { IsoDateTime, JsonValue, ListResponse } from './common';
import type { AuditActionDomain } from './audit-actions';

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

/** Filtres de GET /api/audit et GET /api/audit/export (paramètres de requête). */
export interface AuditListFilters {
  bonId?: string;
  /** Qui a agi : fragment du nom affiché ou de l'email (`userEmail` reste accepté). */
  user?: string;
  /** Action du catalogue (`bon_cancelled`). */
  action?: string;
  /** Famille d'actions. */
  domain?: AuditActionDomain;
  /** Jours civils à l'heure de Paris (AAAA-MM-JJ), bornes incluses. */
  dateFrom?: string;
  dateTo?: string;
}

/** Données annexes de la liste : ce que donnerait un export avec les mêmes filtres. */
export interface AuditListMeta {
  /** Plafond de lignes d'un export (10 000). */
  exportLimit: number;
  /** Un export avec ces filtres serait tronqué à `exportLimit` lignes. */
  exportTruncated: boolean;
}

/** GET /api/audit — liste paginée (25, 50 ou 100 par page), les plus récentes
 *  d'abord. Date ou paramètre invalide : 400. */
export type AuditListResponse = ListResponse<AuditLogEntry, AuditListMeta>;

/** GET /api/audit/actions — actions distinctes présentes en base, triées par
 *  ordre alphabétique. */
export type AuditActionsResponse = ListResponse<string>;
