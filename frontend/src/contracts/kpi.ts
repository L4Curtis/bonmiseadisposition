// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/kpi.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — tableau de bord KPI (`backend/src/kpi/`).
 *
 * Accès : admin, technician, direction. Les trois routes acceptent
 * `from`/`to` (AAAA-MM-JJ, 30 derniers jours par défaut) et `filialeId` ;
 * une période invalide est refusée en 400. Réponses mises en cache 60 s.
 */

import type { BonStatus, EquipmentCategory, SignatureType } from './common';
import type { ParcCategoryCount, ParcFilialeCount, ParcSituationCount } from './inventory';

// ─── Briques communes aux trois routes ────────────────────────────────────────

/** Date civile « AAAA-MM-JJ » (Europe/Paris) — et non une date-heure ISO :
 *  bornes de période, début de bucket, date de restitution prévue. */
export type KpiDate = string;

/** Granularité des séries, déduite de la durée : jour ≤ 31 j,
 *  semaine ≤ 182 j (buckets alignés sur le lundi), sinon mois (alignés sur le 1er). */
export type KpiGranularity = 'day' | 'week' | 'month';

/** Période courante résolue. */
export interface KpiPeriodInfo {
  from: KpiDate;
  to: KpiDate;
  granularity: KpiGranularity;
  /** Nombre de jours, bornes incluses. */
  days: number;
}

/** Période de comparaison : même durée, se terminant la veille de `from`. */
export interface KpiPreviousInfo {
  from: KpiDate;
  to: KpiDate;
}

/** Enveloppe commune aux trois réponses KPI. */
export interface KpiEnvelope {
  period: KpiPeriodInfo;
  previous: KpiPreviousInfo;
  /** Filtre filiale appliqué, `null` sans filtre. */
  filialeId: string | null;
}

/** Compteur d'un flux sur la période courante et sur la précédente. Les deux
 *  valeurs sont toujours des nombres (0 à défaut de données). */
export interface KpiCompared {
  current: number;
  previous: number;
}

/** Ratio ou moyenne comparés : `null` quand le dénominateur est nul ou qu'il
 *  n'y a aucune donnée. */
export interface KpiRatioCompared {
  current: number | null;
  previous: number | null;
}

/** Point d'une série à une seule mesure. Un point par bucket de la période,
 *  à 0 si vide. */
export interface KpiSeriesPoint {
  bucket: KpiDate;
  count: number;
}

// ─── GET /api/kpi/parc ────────────────────────────────────────────────────────

/** Top 10 des modèles de catalogue les plus prêtés. */
export interface KpiParcTopModel {
  catalogItemId: string;
  /** « marque modèle ». */
  label: string;
  category: EquipmentCategory;
  count: number;
}

/** Parc en circulation (état instantané, sauf `series`). */
export interface KpiParcLoaned {
  /** Équipements en circulation ; égal à `/reporting/inventory/summary.total`
   *  sans filtre filiale. */
  total: number;
  /** Bons distincts concernés. */
  bons: number;
  byCategory: ParcCategoryCount[];
  byFiliale: ParcFilialeCount[];
  /** Toujours trois éléments ; somme égale à `total`. */
  bySituation: ParcSituationCount[];
  topModels: KpiParcTopModel[];
  /** Part hors catalogue (0 à 1), `null` si le parc est vide. */
  offCatalogShare: number | null;
  /** Part avec numéro de série renseigné (0 à 1), `null` si le parc est vide. */
  serialCoverage: number | null;
  /** Stock estimé en fin de bucket. */
  series: KpiSeriesPoint[];
}

/** Bon en retard de restitution (top 10, les plus en retard d'abord). */
export interface KpiParcReturnOverdueItem {
  bonId: string;
  reference: string;
  /** Nom affiché de la filiale. */
  filiale: string;
  /** Nom affiché du collaborateur. */
  collaborateur: string;
  /** Date de restitution prévue, au format AAAA-MM-JJ. */
  dateRestitution: KpiDate;
  daysLate: number;
  /** Équipements en circulation sur ce bon. */
  equipments: number;
}

/** Retards de restitution (état instantané). */
export interface KpiParcReturnOverdue {
  bons: number;
  equipments: number;
  /** `null` sans aucun bon en retard. */
  avgDays: number | null;
  /** `null` sans aucun bon en retard. */
  medianDays: number | null;
  top: KpiParcReturnOverdueItem[];
}

/** Équipements déclarés non rendus. */
export interface KpiParcNotReturned {
  declared: KpiCompared;
  found: KpiCompared;
  /** Part des bons archivés sur la période ayant au moins un non-rendu. */
  closedBonsShare: KpiRatioCompared;
  /** Non-rendus sur un bon ni archivé ni annulé (état instantané). */
  openNow: number;
}

/** GET /api/kpi/parc — parc en circulation, retards de restitution, non-rendus. */
export interface KpiParcResponse extends KpiEnvelope {
  loaned: KpiParcLoaned;
  returnOverdue: KpiParcReturnOverdue;
  notReturned: KpiParcNotReturned;
}

// ─── GET /api/kpi/delais ──────────────────────────────────────────────────────

/** Étape de signature suivie par les délais et l'attente. */
export type KpiWorkflowStep = Extract<SignatureType, 'mise_disposition' | 'restitution' | 'pv_cloture'>;

/** Point de la série des volumes. */
export interface KpiDelaisVolumeSeriesPoint {
  bucket: KpiDate;
  created: number;
  sent: number;
  archived: number;
}

/** Bons créés, envoyés, archivés et annulés sur la période. */
export interface KpiDelaisVolumes {
  created: KpiCompared;
  sent: KpiCompared;
  archived: KpiCompared;
  cancelled: KpiCompared;
  series: KpiDelaisVolumeSeriesPoint[];
}

/** Nombre de bons par statut (état instantané) : toujours les huit statuts,
 *  dans l'ordre draft, sent_mise_dispo, active, sent_restitution,
 *  partially_returned, contested, archived, cancelled, à 0 si absents. */
export interface KpiStatusBreakdownItem {
  status: BonStatus;
  /** Libellé français (STATUS_LABELS). */
  label: string;
  count: number;
}

/** Médiane et 90ᵉ centile du délai création → premier envoi, en heures. */
export interface KpiCreationToSendMetrics {
  medianHours: number | null;
  p90Hours: number | null;
}

/** Délai création → premier envoi. */
export interface KpiCreationToSend extends KpiCreationToSendMetrics {
  /** Bons envoyés pour la première fois sur la période courante. */
  count: number;
  previous: KpiCreationToSendMetrics;
}

/** Délai envoi → signature d'une étape. `within48h` et `within7d` sont des
 *  parts (0 à 1). Toutes les valeurs sont `null` sans signature. */
export interface KpiSendToSignatureMetrics {
  medianHours: number | null;
  p90Hours: number | null;
  within48h: number | null;
  within7d: number | null;
}

/** Délai envoi → signature d'une étape, période courante et précédente. */
export interface KpiSendToSignatureStep extends KpiSendToSignatureMetrics {
  /** Signatures de la période courante. */
  count: number;
  previous: KpiSendToSignatureMetrics;
}

/** Délai envoi → signature, par étape. */
export interface KpiSendToSignature {
  mise_disposition: KpiSendToSignatureStep;
  restitution: KpiSendToSignatureStep;
  pv_cloture: KpiSendToSignatureStep;
}

/** Mode de signature (toutes étapes confondues) ; `remote` = total − présentiel. */
export interface KpiSignatureMode {
  inPerson: KpiCompared;
  remote: KpiCompared;
  proxy: KpiCompared;
}

/** Durée de prêt des bons archivés sur la période, en jours. */
export interface KpiLoanDuration {
  /** Bons archivés sur la période courante. */
  count: number;
  avgDays: KpiRatioCompared;
  medianDays: KpiRatioCompared;
}

/** Bons en attente de signature à une étape (état instantané). */
export interface KpiWaitingStep {
  step: KpiWorkflowStep;
  label: string;
  count: number;
  /** Âge moyen en jours depuis la dernière modification, `null` si aucun bon. */
  avgAgeDays: number | null;
  /** Bons en retard de signature (seuil `thresholdDays`). */
  overdue: number;
}

/** Signatures en attente : toujours trois étapes, dans l'ordre
 *  mise_disposition, restitution, pv_cloture. */
export interface KpiWaiting {
  /** Seuil de retard en jours (configuration `rappels.signature_overdue_days`). */
  thresholdDays: number;
  /** Somme des `overdue` des étapes. */
  overdueTotal: number;
  steps: KpiWaitingStep[];
}

/** GET /api/kpi/delais — volumes, répartition par statut, délais de
 *  traitement et signatures en attente. */
export interface KpiDelaisResponse extends KpiEnvelope {
  volumes: KpiDelaisVolumes;
  statusBreakdown: KpiStatusBreakdownItem[];
  creationToSend: KpiCreationToSend;
  sendToSignature: KpiSendToSignature;
  signatureMode: KpiSignatureMode;
  loanDuration: KpiLoanDuration;
  waiting: KpiWaiting;
}

// ─── GET /api/kpi/incidents ───────────────────────────────────────────────────

/** Motif de clôture unilatérale (période courante seule, top 10) ;
 *  « Non renseigné » si le motif est vide. */
export interface KpiClosureReason {
  reason: string;
  count: number;
}

/** Contestations. */
export interface KpiIncidentsContestations {
  opened: KpiCompared;
  /** Contestations `open` ou `in_review` (état instantané). */
  openNow: number;
  /** Contestations `resolved` ou `rejected` sur la période. */
  closed: KpiCompared;
  resolutionMedianDays: KpiRatioCompared;
  /** Part des contestations closes résolues favorablement (0 à 1). */
  acceptanceRate: KpiRatioCompared;
}

/** Rappels envoyés pour un rang donné. */
export interface KpiReminderRankStat {
  rank: number;
  sent: KpiCompared;
  signedAfter: KpiCompared;
  /** `signedAfter.current / sent.current`, `null` si aucun rappel envoyé. */
  efficiency: number | null;
}

/** Rappels : `byRank` contient toujours les rangs 1 à 3 (à 0 si besoin), plus
 *  les rangs supérieurs observés sur l'une des deux périodes, triés par rang. */
export interface KpiIncidentsReminders {
  byRank: KpiReminderRankStat[];
  bonsWithThreeOrMore: KpiCompared;
}

/** GET /api/kpi/incidents — non-rendus, PV de clôture, clôtures unilatérales,
 *  annulations, contestations, rappels et emails en échec. */
export interface KpiIncidentsResponse extends KpiEnvelope {
  notReturned: {
    declared: KpiCompared;
    found: KpiCompared;
  };
  pvCloture: {
    emitted: KpiCompared;
  };
  unilateralClosures: {
    count: KpiCompared;
    reasons: KpiClosureReason[];
  };
  cancellations: {
    count: KpiCompared;
  };
  contestations: KpiIncidentsContestations;
  reminders: KpiIncidentsReminders;
  failedEmails: {
    count: KpiCompared;
  };
}
