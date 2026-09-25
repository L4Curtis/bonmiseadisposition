/**
 * Contrats de l'API — rétention RGPD : anonymisation des bons anciens et purge
 * technique (liens de signature expirés, vieux journaux d'audit).
 *
 * Contrôleur : `retention/retention.controller.ts` (préfixe
 * `/api/admin/retention`), entièrement réservé à l'administrateur.
 */

import type { IsoDateTime, OkResponse } from './common';

/**
 * GET /api/admin/retention/preview et POST /api/admin/retention/run — même
 * forme pour l'aperçu, la simulation (`{ dryRun: true }`) et le lancement réel.
 *
 * - L'aperçu compte exactement les bons éligibles ; la simulation et le
 *   lancement réel s'arrêtent au lot de 500 bons traité par un passage.
 * - L'aperçu et la simulation renvoient `anonymized` et `attachmentsPurged`
 *   à 0, `dryRun` à vrai, et `oldAttachmentsPurged` compte les pièces jointes
 *   qui seraient purgées sans rien supprimer.
 * - Un lancement réel sans simulation de moins de 24 h répond 400.
 */
export interface RetentionRunResult {
  /** Bons clôturés ou annulés, non encore anonymisés, antérieurs à `cutoff`. */
  eligible: number;
  /** Bons réellement anonymisés (0 en aperçu et en simulation). */
  anonymized: number;
  /** Pièces jointes purgées avec les bons anonymisés de ce passage. */
  attachmentsPurged: number;
  /** Pièces jointes purgées (ou à purger) selon `retention.attachment_months`,
   *  indépendamment de l'anonymisation. */
  oldAttachmentsPurged: number;
  /** Date limite d'anonymisation : un bon modifié avant elle est éligible. */
  cutoff: IsoDateTime;
  dryRun: boolean;
}

/** Durées de conservation appliquées (valeurs par défaut si non configurées). */
export interface RetentionStatsConfig {
  expiredTokensDays: number;
  auditLogsYears: number;
  attachmentMonths: number;
}

/** Volumes qu'une purge supprimerait aujourd'hui. */
export interface RetentionPurgeable {
  expiredTokens: number;
  oldAuditLogs: number;
  oldAttachments: number;
}

/** Volumes totaux en base. */
export interface RetentionTotals {
  auditLogs: number;
  signatures: number;
}

/** GET /api/admin/retention/stats — statistiques de rétention technique. */
export interface RetentionStatsResponse {
  /** Anonymisation automatique activée (`retention.enabled` vaut « true »). */
  enabled: boolean;
  config: RetentionStatsConfig;
  purgeable: RetentionPurgeable;
  totals: RetentionTotals;
}

/**
 * POST /api/admin/retention/purge — purge technique : liens de signature
 * expirés jamais signés et journaux d'audit au-delà de leur durée de conservation.
 */
export interface RetentionPurgeResponse extends OkResponse {
  expiredTokens: number;
  oldAuditLogs: number;
}
