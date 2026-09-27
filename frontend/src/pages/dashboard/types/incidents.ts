import type { Compared, KpiEnvelope } from './common';

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface WithoutSignature {
  handovers: Compared;
  closures: Compared;
  handoverReasons: ReasonCount[];
  closureReasons: ReasonCount[];
}

export interface Contestations {
  received: Compared;
  toProcess: number;
  decided: Compared;
  founded: Compared;
  notRetained: Compared;
  resolutionMedianDays: Compared<number | null>;
}

export interface ReminderRank {
  rank: number;
  sent: Compared;
  signedAfter: Compared;
  efficiency: number | null;
}

export interface Reminders {
  byRank: ReminderRank[];
  documentsWithThreeOrMore: Compared;
}

/** GET /kpi/incidents */
export interface IncidentsKpiResponse extends KpiEnvelope {
  notReturned: { declared: Compared; found: Compared; stillMissing: number };
  pvCloture: { emitted: Compared };
  withoutSignature: WithoutSignature;
  cancellations: { count: Compared };
  contestations: Contestations;
  reminders: Reminders;
  failedEmails: { count: Compared };
}
