/**
 * Types de réponse des endpoints `GET /kpi/parc|delais|incidents`.
 *
 * Recopiés fidèlement des contrats JSON du document de conception
 * (kpi-design.md). Organisés en sections par onglet : chaque lot (2a/2b/2c)
 * ne modifie que sa propre section.
 */

import { EquipmentSituation } from '../common/bon-predicates';

// ── commun ───────────────────────────────────────────────────────────────

export type Granularity = 'day' | 'week' | 'month';

/** Bornes de la période courante retournées dans l'enveloppe de réponse. */
export interface PeriodInfo {
  from: string;
  to: string;
  granularity: Granularity;
  days: number;
}

/** Bornes de la période précédente (comparaison). */
export interface PreviousInfo {
  from: string;
  to: string;
}

/** Comparaison courant / précédent pour un flux (compteur sur la période). */
export interface Compared {
  current: number;
  previous: number | null;
}

/** Comparaison courant / précédent pour un ratio ou une moyenne : les deux
 *  valeurs peuvent être `null` (dénominateur nul, aucune donnée). */
export interface RatioCompared {
  current: number | null;
  previous: number | null;
}

/** Point d'une série temporelle simple (une seule mesure par bucket). */
export interface SeriesPoint {
  bucket: string;
  count: number;
}

/** Enveloppe commune aux trois endpoints KPI. */
export interface KpiEnvelope {
  period: PeriodInfo;
  previous: PreviousInfo;
  filialeId: string | null;
}

// ── parc ─────────────────────────────────────────────────────────────────

export interface ParcCategoryCount {
  category: string;
  label: string;
  count: number;
}

export interface ParcFilialeCount {
  filialeId: string;
  name: string;
  count: number;
}

/** Répartition du parc en circulation par situation (cf. bon-predicates.ts) —
 *  la somme des `count` égale toujours `ParcLoaned.total`. */
export interface ParcSituationCount {
  situation: EquipmentSituation;
  label: string;
  count: number;
}

export interface ParcTopModel {
  catalogItemId: string;
  label: string;
  category: string;
  count: number;
}

export interface ParcLoaned {
  total: number;
  bons: number;
  byCategory: ParcCategoryCount[];
  byFiliale: ParcFilialeCount[];
  bySituation: ParcSituationCount[];
  topModels: ParcTopModel[];
  offCatalogShare: number | null;
  serialCoverage: number | null;
  series: SeriesPoint[];
}

export interface ParcReturnOverdueItem {
  bonId: string;
  reference: string;
  filiale: string;
  collaborateur: string;
  dateRestitution: string;
  daysLate: number;
  equipments: number;
}

export interface ParcReturnOverdue {
  bons: number;
  equipments: number;
  avgDays: number | null;
  medianDays: number | null;
  top: ParcReturnOverdueItem[];
}

export interface ParcNotReturned {
  declared: Compared;
  found: Compared;
  closedBonsShare: RatioCompared;
  openNow: number;
}

export interface KpiParcResponse extends KpiEnvelope {
  loaned: ParcLoaned;
  returnOverdue: ParcReturnOverdue;
  notReturned: ParcNotReturned;
}

// ── delais ───────────────────────────────────────────────────────────────

export interface DelaisVolumeSeriesPoint {
  bucket: string;
  created: number;
  sent: number;
  archived: number;
}

export interface DelaisVolumes {
  created: Compared;
  sent: Compared;
  archived: Compared;
  cancelled: Compared;
  series: DelaisVolumeSeriesPoint[];
}

export interface StatusBreakdownItem {
  status: string;
  label: string;
  count: number;
}

export interface CreationToSendPrevious {
  medianHours: number | null;
  p90Hours: number | null;
}

export interface CreationToSend {
  count: number;
  medianHours: number | null;
  p90Hours: number | null;
  previous: CreationToSendPrevious;
}

export interface SendToSignatureMetrics {
  medianHours: number | null;
  p90Hours: number | null;
  within48h: number | null;
  within7d: number | null;
}

export interface SendToSignatureStep extends SendToSignatureMetrics {
  count: number;
  previous: SendToSignatureMetrics;
}

export interface SendToSignature {
  mise_disposition: SendToSignatureStep;
  restitution: SendToSignatureStep;
  pv_cloture: SendToSignatureStep;
}

export interface SignatureMode {
  inPerson: Compared;
  remote: Compared;
  proxy: Compared;
}

export interface LoanDuration {
  count: number;
  avgDays: RatioCompared;
  medianDays: RatioCompared;
}

export type WaitingStepId = 'mise_disposition' | 'restitution' | 'pv_cloture';

export interface KpiWaitingStep {
  step: WaitingStepId;
  label: string;
  count: number;
  avgAgeDays: number | null;
  overdue: number;
}

export interface KpiWaiting {
  thresholdDays: number;
  overdueTotal: number;
  steps: KpiWaitingStep[];
}

export interface KpiDelaisResponse extends KpiEnvelope {
  volumes: DelaisVolumes;
  statusBreakdown: StatusBreakdownItem[];
  creationToSend: CreationToSend;
  sendToSignature: SendToSignature;
  signatureMode: SignatureMode;
  loanDuration: LoanDuration;
  waiting: KpiWaiting;
}

// ── incidents ────────────────────────────────────────────────────────────

export interface IncidentsNotReturned {
  declared: Compared;
  found: Compared;
}

export interface IncidentsPvCloture {
  emitted: Compared;
}

export interface ClosureReason {
  reason: string;
  count: number;
}

export interface IncidentsUnilateralClosures {
  count: Compared;
  reasons: ClosureReason[];
}

export interface IncidentsCancellations {
  count: Compared;
}

export interface IncidentsContestations {
  opened: Compared;
  openNow: number;
  closed: Compared;
  resolutionMedianDays: RatioCompared;
  acceptanceRate: RatioCompared;
}

export interface ReminderRankStat {
  rank: number;
  sent: Compared;
  signedAfter: Compared;
  efficiency: number | null;
}

export interface IncidentsReminders {
  byRank: ReminderRankStat[];
  bonsWithThreeOrMore: Compared;
}

export interface IncidentsFailedEmails {
  count: Compared;
}

export interface KpiIncidentsResponse extends KpiEnvelope {
  notReturned: IncidentsNotReturned;
  pvCloture: IncidentsPvCloture;
  unilateralClosures: IncidentsUnilateralClosures;
  cancellations: IncidentsCancellations;
  contestations: IncidentsContestations;
  reminders: IncidentsReminders;
  failedEmails: IncidentsFailedEmails;
}
