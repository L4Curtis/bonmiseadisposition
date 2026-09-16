import type { Compared, KpiEnvelope } from './common';

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface UnilateralClosures {
  count: Compared;
  reasons: ReasonCount[];
}

export interface Contestations {
  opened: Compared;
  openNow: number;
  closed: Compared;
  resolutionMedianDays: Compared<number | null>;
  acceptanceRate: Compared<number | null>;
}

export interface ReminderRank {
  rank: number;
  sent: Compared;
  signedAfter: Compared;
  efficiency: number | null;
}

export interface Reminders {
  byRank: ReminderRank[];
  bonsWithThreeOrMore: Compared;
}

/** GET /kpi/incidents */
export interface IncidentsKpiResponse extends KpiEnvelope {
  notReturned: { declared: Compared; found: Compared };
  pvCloture: { emitted: Compared };
  unilateralClosures: UnilateralClosures;
  cancellations: { count: Compared };
  contestations: Contestations;
  reminders: Reminders;
  failedEmails: { count: Compared };
}
