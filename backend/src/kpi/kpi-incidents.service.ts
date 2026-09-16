import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod } from './kpi-period';
import { KpiIncidentsResponse } from './kpi-types';

/**
 * `GET /kpi/incidents` — non-rendus, clôtures, contestations, rappels.
 *
 * Squelette (lot 2-core) : renvoie l'enveloppe avec des blocs vides
 * correctement typés. Le corps SQL est implémenté par le lot 2c.
 */
@Injectable()
export class KpiIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  // TODO lot 2c : implémentation
  async getIncidents(period: KpiPeriod, filialeId?: string): Promise<KpiIncidentsResponse> {
    return Promise.resolve({
      period: {
        from: period.from,
        to: period.to,
        granularity: period.granularity,
        days: period.days,
      },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      notReturned: {
        declared: { current: 0, previous: null },
        found: { current: 0, previous: null },
      },
      pvCloture: {
        emitted: { current: 0, previous: null },
      },
      unilateralClosures: {
        count: { current: 0, previous: null },
        reasons: [],
      },
      cancellations: {
        count: { current: 0, previous: null },
      },
      contestations: {
        opened: { current: 0, previous: null },
        openNow: 0,
        closed: { current: 0, previous: null },
        resolutionMedianDays: { current: null, previous: null },
        acceptanceRate: { current: null, previous: null },
      },
      reminders: {
        byRank: [],
        bonsWithThreeOrMore: { current: 0, previous: null },
      },
      failedEmails: {
        count: { current: 0, previous: null },
      },
    });
  }
}
