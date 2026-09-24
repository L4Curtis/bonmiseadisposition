import { api } from '@/lib/api';

/** Réponse de GET /admin/retention/preview et POST /admin/retention/run. */
export interface RetentionRunResult {
  eligible: number;
  anonymized: number;
  attachmentsPurged: number;
  oldAttachmentsPurged: number;
  cutoff: string;
  dryRun: boolean;
}

/** Réponse de GET /admin/retention/stats. */
export interface RetentionStats {
  enabled: boolean;
  config: { expiredTokensDays: number; auditLogsYears: number; attachmentMonths: number };
  purgeable: { expiredTokens: number; oldAuditLogs: number; oldAttachments: number };
  totals: { auditLogs: number; signatures: number };
}

/** Ce que toucherait la rétention avec les durées enregistrées. */
export interface RetentionSimulation {
  /** Bons clôturés/annulés qui seraient anonymisés (décompte exact). */
  bons: number;
  /** Date avant laquelle un bon est éligible à l'anonymisation. */
  anonymizeCutoff: string;
  /** Pièces jointes purgées par la durée dédiée. */
  attachments: number;
  /** Lignes du journal d'audit au-delà de leur durée de conservation. */
  auditLogs: number;
  auditLogsTotal: number;
  /** Liens de signature expirés jamais signés. */
  expiredTokens: number;
  /** Moment de la simulation (horloge du poste). */
  simulatedAt: number;
}

/** Durée de validité d'une simulation pour un lancement manuel — miroir de
 *  DRY_RUN_MAX_AGE_MS côté serveur (retention.service.ts), qui l'impose. */
export const SIMULATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Simulation complète, sans rien modifier dans les données :
 * - POST /admin/retention/run { dryRun: true } — compte seulement, et
 *   enregistre l'horodatage de simulation que le serveur exige (moins de 24 h)
 *   avant tout lancement manuel réel ;
 * - GET /admin/retention/preview — décompte exact des bons (le dry-run s'arrête
 *   au lot de 500 traité par un run) et des pièces jointes ;
 * - GET /admin/retention/stats — journal d'audit et liens expirés.
 */
export async function simulateRetention(): Promise<RetentionSimulation> {
  await api.post<RetentionRunResult>('/admin/retention/run', { dryRun: true });
  const [preview, stats] = await Promise.all([
    api.get<RetentionRunResult>('/admin/retention/preview'),
    api.get<RetentionStats>('/admin/retention/stats'),
  ]);
  return {
    bons: preview.eligible,
    anonymizeCutoff: preview.cutoff,
    attachments: preview.oldAttachmentsPurged,
    auditLogs: stats.purgeable.oldAuditLogs,
    auditLogsTotal: stats.totals.auditLogs,
    expiredTokens: stats.purgeable.expiredTokens,
    simulatedAt: Date.now(),
  };
}

/** Une simulation est-elle encore valable pour un lancement manuel ? */
export function isSimulationFresh(sim: RetentionSimulation | null, now: number = Date.now()): boolean {
  return !!sim && now - sim.simulatedAt < SIMULATION_MAX_AGE_MS;
}
