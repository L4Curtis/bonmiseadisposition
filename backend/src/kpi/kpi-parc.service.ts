import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod } from './kpi-period';
import { KpiParcResponse } from './kpi-types';

/**
 * `GET /kpi/parc` — parc prêté, retards de restitution, non-rendus.
 *
 * Squelette (lot 2-core) : renvoie l'enveloppe avec des blocs vides
 * correctement typés. Le corps SQL est implémenté par le lot 2a.
 */
@Injectable()
export class KpiParcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  // TODO lot 2a : implémentation
  async getParc(period: KpiPeriod, filialeId?: string): Promise<KpiParcResponse> {
    return Promise.resolve({
      period: {
        from: period.from,
        to: period.to,
        granularity: period.granularity,
        days: period.days,
      },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      loaned: {
        total: 0,
        bons: 0,
        byCategory: [],
        byFiliale: [],
        topModels: [],
        offCatalogShare: null,
        serialCoverage: null,
        series: [],
      },
      returnOverdue: {
        bons: 0,
        equipments: 0,
        avgDays: null,
        medianDays: null,
        top: [],
      },
      notReturned: {
        declared: { current: 0, previous: null },
        found: { current: 0, previous: null },
        closedBonsShare: { current: null, previous: null },
        openNow: 0,
      },
    });
  }
}
