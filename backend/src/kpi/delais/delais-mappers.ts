import { STATUS_LABELS } from '../../common/status-labels';
import { buildBuckets, fillSeries, KpiPeriod } from '../kpi-period';
import { bucketLabel, compared, ratio, toNumber } from '../kpi-sql';
import {
  CreationToSend,
  DelaisVolumeSeriesPoint,
  DelaisVolumes,
  KpiWaiting,
  KpiWaitingStep,
  LoanDuration,
  SendToSignature,
  SendToSignatureMetrics,
  SendToSignatureStep,
  SignatureMode,
  StatusBreakdownItem,
  WaitingStepId,
} from '../kpi-types';
import {
  CreationToSendAggregate,
  LoanDurationAggregate,
  SendToSignatureRow,
  SeriesRow,
  StatusRow,
  VolumeAggregate,
  WaitingRow,
} from './delais-queries';

/**
 * Mise en forme pure (sans accès base) des lignes SQL brutes de
 * `delais-queries.ts` vers les types de réponse `GET /kpi/delais`. Séparé de
 * l'accès base pour garder chaque fichier du lot sous 400 lignes.
 */

/** Ordre fixe d'affichage des statuts — les statuts absents des lignes SQL
 *  sont renvoyés à 0 (jamais omis de la réponse). */
const STATUS_ORDER = [
  'draft',
  'sent_mise_dispo',
  'active',
  'sent_restitution',
  'partially_returned',
  'contested',
  'archived',
  'cancelled',
] as const;

/** Les trois étapes de workflow suivies par `sendToSignature` et `waiting`,
 *  dans l'ordre d'affichage attendu par le contrat JSON. */
const WORKFLOW_STEP_ORDER: readonly WaitingStepId[] = ['mise_disposition', 'restitution', 'pv_cloture'];

const WAITING_STEP_LABELS: Record<WaitingStepId, string> = {
  mise_disposition: 'Signature mise à disposition',
  restitution: 'Signature restitution',
  pv_cloture: 'PV de clôture',
};

const EMPTY_METRICS: SendToSignatureMetrics = {
  medianHours: null,
  p90Hours: null,
  within48h: null,
  within7d: null,
};

// ── statusBreakdown ──────────────────────────────────────────────────────

export function buildStatusBreakdown(rows: readonly StatusRow[]): StatusBreakdownItem[] {
  const counts = new Map(rows.map((r) => [r.status, toNumber(r.count)]));
  return STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status] ?? status,
    count: counts.get(status) ?? 0,
  }));
}

// ── volumes ──────────────────────────────────────────────────────────────

function toSeriesPoint(row: SeriesRow): { bucket: string; count: number } {
  return { bucket: bucketLabel(row.bucket), count: toNumber(row.count) };
}

function buildVolumeSeries(
  period: Pick<KpiPeriod, 'from' | 'to' | 'granularity'>,
  createdRows: readonly SeriesRow[],
  sentRows: readonly SeriesRow[],
  archivedRows: readonly SeriesRow[],
): DelaisVolumeSeriesPoint[] {
  const buckets = buildBuckets({ from: period.from, to: period.to }, period.granularity);
  const created = fillSeries(buckets, createdRows.map(toSeriesPoint), 'count', 0);
  const sent = fillSeries(buckets, sentRows.map(toSeriesPoint), 'count', 0);
  const archived = fillSeries(buckets, archivedRows.map(toSeriesPoint), 'count', 0);

  return buckets.map((bucket, i) => ({
    bucket,
    created: created[i].count,
    sent: sent[i].count,
    archived: archived[i].count,
  }));
}

export function buildVolumes(
  period: Pick<KpiPeriod, 'from' | 'to' | 'granularity'>,
  current: VolumeAggregate,
  previous: VolumeAggregate,
  createdRows: readonly SeriesRow[],
  sentRows: readonly SeriesRow[],
  archivedRows: readonly SeriesRow[],
): DelaisVolumes {
  return {
    created: compared(current.created, previous.created),
    sent: compared(current.sent, previous.sent),
    archived: compared(current.archived, previous.archived),
    cancelled: compared(current.cancelled, previous.cancelled),
    series: buildVolumeSeries(period, createdRows, sentRows, archivedRows),
  };
}

// ── creationToSend ───────────────────────────────────────────────────────

export function buildCreationToSend(current: CreationToSendAggregate, previous: CreationToSendAggregate): CreationToSend {
  return {
    count: current.count,
    medianHours: current.medianHours,
    p90Hours: current.p90Hours,
    previous: { medianHours: previous.medianHours, p90Hours: previous.p90Hours },
  };
}

// ── sendToSignature + signatureMode ─────────────────────────────────────

function toMetrics(row: SendToSignatureRow | undefined): SendToSignatureMetrics {
  if (!row) return { ...EMPTY_METRICS };
  const count = toNumber(row.count);
  return {
    medianHours: row.medianHours == null ? null : toNumber(row.medianHours),
    p90Hours: row.p90Hours == null ? null : toNumber(row.p90Hours),
    within48h: ratio(toNumber(row.within48h), count),
    within7d: ratio(toNumber(row.within7d), count),
  };
}

function toStep(current: SendToSignatureRow | undefined, previous: SendToSignatureRow | undefined): SendToSignatureStep {
  return {
    count: toNumber(current?.count),
    ...toMetrics(current),
    previous: toMetrics(previous),
  };
}

function sumBy(rows: readonly SendToSignatureRow[], pick: (row: SendToSignatureRow) => unknown): number {
  return rows.reduce((sum, row) => sum + toNumber(pick(row)), 0);
}

function remoteCount(rows: readonly SendToSignatureRow[]): number {
  return sumBy(rows, (r) => r.count) - sumBy(rows, (r) => r.inPerson);
}

export function buildSendToSignature(
  currentRows: readonly SendToSignatureRow[],
  previousRows: readonly SendToSignatureRow[],
): { sendToSignature: SendToSignature; signatureMode: SignatureMode } {
  const currentByType = new Map(currentRows.map((r) => [r.type, r]));
  const previousByType = new Map(previousRows.map((r) => [r.type, r]));

  const [miseDisposition, restitution, pvCloture] = WORKFLOW_STEP_ORDER.map((type) =>
    toStep(currentByType.get(type), previousByType.get(type)),
  );

  const sendToSignature: SendToSignature = {
    mise_disposition: miseDisposition,
    restitution,
    pv_cloture: pvCloture,
  };

  const signatureMode: SignatureMode = {
    inPerson: compared(sumBy(currentRows, (r) => r.inPerson), sumBy(previousRows, (r) => r.inPerson)),
    remote: compared(remoteCount(currentRows), remoteCount(previousRows)),
    proxy: compared(sumBy(currentRows, (r) => r.proxy), sumBy(previousRows, (r) => r.proxy)),
  };

  return { sendToSignature, signatureMode };
}

// ── loanDuration ─────────────────────────────────────────────────────────

export function buildLoanDuration(current: LoanDurationAggregate, previous: LoanDurationAggregate): LoanDuration {
  return {
    count: current.count,
    avgDays: { current: current.avgDays, previous: previous.avgDays },
    medianDays: { current: current.medianDays, previous: previous.medianDays },
  };
}

// ── waiting ──────────────────────────────────────────────────────────────

export function buildWaiting(thresholdDays: number, rows: readonly WaitingRow[]): KpiWaiting {
  const byStep = new Map(rows.map((r) => [r.step, r]));
  const steps: KpiWaitingStep[] = WORKFLOW_STEP_ORDER.map((step) => {
    const row = byStep.get(step);
    return {
      step,
      label: WAITING_STEP_LABELS[step],
      count: toNumber(row?.count),
      avgAgeDays: row?.avgAgeDays == null ? null : toNumber(row.avgAgeDays),
      overdue: toNumber(row?.overdue),
    };
  });

  return {
    thresholdDays,
    overdueTotal: steps.reduce((sum, s) => sum + s.overdue, 0),
    steps,
  };
}
