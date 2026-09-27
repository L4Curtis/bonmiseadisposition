import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KpiPeriod } from './kpi-period';
import { compared, ratio, toNumber } from './kpi-sql';
import { KpiIncidentsResponse, ReminderRankStat } from './kpi-types';
import {
  Range,
  ReminderRankRow,
  queryAuditCounts,
  queryContestationsFlow,
  queryContestationsToProcess,
  queryDocumentsWithThreeReminders,
  queryFailedEmails,
  queryRemindersByRank,
  queryStillMissing,
  queryWithoutSignatureReasons,
} from './incidents/incidents-queries';

/** Rangs toujours présents dans `reminders.byRank`, même sans rappel envoyé. */
const GUARANTEED_RANKS = [1, 2, 3];

/**
 * `GET /kpi/incidents` — non-restitutions, PV, remises et clôtures sans
 * signature, annulations, contestations, rappels et emails en échec.
 *
 * Les flux (« sur la période ») sont comparés à la période précédente ; les
 * états du jour (`notReturned.stillMissing`, `contestations.toProcess`) ne
 * dépendent pas de la période. Le SQL vit dans `incidents/incidents-queries.ts`.
 */
@Injectable()
export class KpiIncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getIncidents(period: KpiPeriod, filialeId?: string, now: Date = new Date()): Promise<KpiIncidentsResponse> {
    const current: Range = { from: period.from, to: period.to };
    const previous: Range = period.previous;
    const p = this.prisma;

    const [
      auditCurrent, auditPrevious, handoverReasons, closureReasons,
      contestationsCurrent, contestationsPrevious, toProcess, stillMissing,
      remindersCurrent, remindersPrevious, threeCurrent, threePrevious, failedCurrent, failedPrevious,
    ] = await Promise.all([
      queryAuditCounts(p, current, filialeId),
      queryAuditCounts(p, previous, filialeId),
      queryWithoutSignatureReasons(p, 'handover', current, filialeId),
      queryWithoutSignatureReasons(p, 'closure', current, filialeId),
      queryContestationsFlow(p, current, filialeId),
      queryContestationsFlow(p, previous, filialeId),
      queryContestationsToProcess(p, filialeId),
      queryStillMissing(p, filialeId),
      queryRemindersByRank(p, current, filialeId),
      queryRemindersByRank(p, previous, filialeId),
      queryDocumentsWithThreeReminders(p, current, filialeId),
      queryDocumentsWithThreeReminders(p, previous, filialeId),
      queryFailedEmails(p, current, filialeId),
      queryFailedEmails(p, previous, filialeId),
    ]);

    return {
      asOf: now.toISOString(),
      period: { from: period.from, to: period.to, granularity: period.granularity, days: period.days },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      notReturned: {
        declared: compared(auditCurrent.declared, auditPrevious.declared),
        found: compared(auditCurrent.found, auditPrevious.found),
        stillMissing,
      },
      pvCloture: { emitted: compared(auditCurrent.pvEmitted, auditPrevious.pvEmitted) },
      withoutSignature: {
        handovers: compared(auditCurrent.handovers, auditPrevious.handovers),
        closures: compared(auditCurrent.closures, auditPrevious.closures),
        handoverReasons,
        closureReasons,
      },
      cancellations: { count: compared(auditCurrent.cancelled, auditPrevious.cancelled) },
      contestations: {
        received: compared(contestationsCurrent.received, contestationsPrevious.received),
        toProcess,
        decided: compared(contestationsCurrent.decided, contestationsPrevious.decided),
        founded: compared(contestationsCurrent.founded, contestationsPrevious.founded),
        notRetained: compared(contestationsCurrent.notRetained, contestationsPrevious.notRetained),
        resolutionMedianDays: { current: contestationsCurrent.medianDays, previous: contestationsPrevious.medianDays },
      },
      reminders: {
        byRank: buildReminderStats(remindersCurrent, remindersPrevious),
        documentsWithThreeOrMore: compared(threeCurrent, threePrevious),
      },
      failedEmails: { count: compared(failedCurrent, failedPrevious) },
    };
  }
}

/** Fusionne courant et précédent par rang, garantit les rangs 1 à 3 (à 0),
 *  garde les rangs supérieurs observés. `efficiency` = part des rappels
 *  suivis d'une signature du document, sur la période courante seule. */
export function buildReminderStats(current: ReminderRankRow[], previous: ReminderRankRow[]): ReminderRankStat[] {
  const currentByRank = new Map(current.map((r) => [r.rank, r]));
  const previousByRank = new Map(previous.map((r) => [r.rank, r]));
  const ranks = new Set<number>([...GUARANTEED_RANKS, ...currentByRank.keys(), ...previousByRank.keys()]);

  return Array.from(ranks)
    .sort((a, b) => a - b)
    .map((rank) => {
      const sentCurrent = toNumber(currentByRank.get(rank)?.sent);
      const signedAfterCurrent = toNumber(currentByRank.get(rank)?.signedAfter);
      return {
        rank,
        sent: compared(sentCurrent, toNumber(previousByRank.get(rank)?.sent)),
        signedAfter: compared(signedAfterCurrent, toNumber(previousByRank.get(rank)?.signedAfter)),
        efficiency: ratio(signedAfterCurrent, sentCurrent),
      };
    });
}
