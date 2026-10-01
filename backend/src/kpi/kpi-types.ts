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

/** Enveloppe commune aux trois endpoints KPI. `asOf` : instant du calcul, date
 *  des chiffres « état du jour » (non filtrés par la période). */
export interface KpiEnvelope {
  asOf: string;
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
  /** « Signature en retard » à cette étape (bons). */
  overdueSignatures: number;
  /** @deprecated Ancien nom de `overdueSignatures`, servi pendant la vague 3. */
  overdue: number;
}

export interface KpiWaiting {
  thresholdDays: number;
  /** « Signature en retard » : somme des étapes (bons). */
  overdueSignatures: number;
  /** @deprecated Ancien nom de `overdueSignatures`, servi pendant la vague 3. */
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
  /** Équipements déclarés non restitués sur la période. */
  declared: Compared;
  /** Équipements retrouvés sur la période. */
  found: Compared;
  /** Équipements encore non restitués aujourd'hui (état du jour). */
  stillMissing: number;
}

export interface IncidentsPvCloture {
  emitted: Compared;
}

export interface ClosureReason {
  reason: string;
  count: number;
}

export interface IncidentsWithoutSignature {
  handovers: Compared;
  closures: Compared;
  handoverReasons: ClosureReason[];
  closureReasons: ClosureReason[];
}

export interface IncidentsCancellations {
  count: Compared;
}

export interface IncidentsContestations {
  received: Compared;
  toProcess: number;
  decided: Compared;
  founded: Compared;
  notRetained: Compared;
  resolutionMedianDays: RatioCompared;
}

export interface ReminderRankStat {
  rank: number;
  sent: Compared;
  signedAfter: Compared;
  efficiency: number | null;
}

export interface IncidentsReminders {
  byRank: ReminderRankStat[];
  documentsWithThreeOrMore: Compared;
}

export interface IncidentsFailedEmails {
  count: Compared;
}

export interface KpiIncidentsResponse extends KpiEnvelope {
  notReturned: IncidentsNotReturned;
  pvCloture: IncidentsPvCloture;
  withoutSignature: IncidentsWithoutSignature;
  cancellations: IncidentsCancellations;
  contestations: IncidentsContestations;
  reminders: IncidentsReminders;
  failedEmails: IncidentsFailedEmails;
}
