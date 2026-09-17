import type { Compared, KpiEnvelope } from './common';

export interface DelaisVolumesSeriesPoint {
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
  series: DelaisVolumesSeriesPoint[];
}

export interface StatusBreakdownRow {
  status: string;
  label: string;
  count: number;
}

export interface DelaisMetric {
  count: number;
  medianHours: number | null;
  p90Hours: number | null;
  previous: { medianHours: number | null; p90Hours: number | null };
}

export interface SendToSignatureMetric {
  count: number;
  medianHours: number | null;
  p90Hours: number | null;
  within48h: number | null;
  within7d: number | null;
  previous: { medianHours: number | null; p90Hours: number | null; within48h: number | null; within7d: number | null };
}

export interface SendToSignature {
  mise_disposition: SendToSignatureMetric;
  restitution: SendToSignatureMetric;
  pv_cloture: SendToSignatureMetric;
}

export interface SignatureModeCounts {
  inPerson: Compared;
  remote: Compared;
  proxy: Compared;
}

export interface LoanDuration {
  count: number;
  avgDays: Compared<number | null>;
  medianDays: Compared<number | null>;
}

export interface WaitingStep {
  step: string;
  label: string;
  count: number;
  avgAgeDays: number | null;
  overdue: number;
}

export interface Waiting {
  thresholdDays: number;
  overdueTotal: number;
  steps: WaitingStep[];
}

/** GET /kpi/delais */
export interface DelaisKpiResponse extends KpiEnvelope {
  volumes: DelaisVolumes;
  statusBreakdown: StatusBreakdownRow[];
  creationToSend: DelaisMetric;
  sendToSignature: SendToSignature;
  signatureMode: SignatureModeCounts;
  loanDuration: LoanDuration;
  waiting: Waiting;
}
