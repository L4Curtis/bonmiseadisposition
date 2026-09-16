import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod } from './kpi-period';
import { KpiDelaisResponse, SendToSignatureStep } from './kpi-types';

const EMPTY_SEND_TO_SIGNATURE_STEP: SendToSignatureStep = {
  count: 0,
  medianHours: null,
  p90Hours: null,
  within48h: null,
  within7d: null,
  previous: { medianHours: null, p90Hours: null, within48h: null, within7d: null },
};

/**
 * `GET /kpi/delais` — volumes, délais de traitement, étapes en attente.
 *
 * Squelette (lot 2-core) : renvoie l'enveloppe avec des blocs vides
 * correctement typés. Le corps SQL est implémenté par le lot 2b.
 */
@Injectable()
export class KpiDelaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  // TODO lot 2b : implémentation
  async getDelais(period: KpiPeriod, filialeId?: string): Promise<KpiDelaisResponse> {
    return Promise.resolve({
      period: {
        from: period.from,
        to: period.to,
        granularity: period.granularity,
        days: period.days,
      },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      volumes: {
        created: { current: 0, previous: null },
        sent: { current: 0, previous: null },
        archived: { current: 0, previous: null },
        cancelled: { current: 0, previous: null },
        series: [],
      },
      statusBreakdown: [],
      creationToSend: {
        count: 0,
        medianHours: null,
        p90Hours: null,
        previous: { medianHours: null, p90Hours: null },
      },
      sendToSignature: {
        mise_disposition: EMPTY_SEND_TO_SIGNATURE_STEP,
        restitution: EMPTY_SEND_TO_SIGNATURE_STEP,
        pv_cloture: EMPTY_SEND_TO_SIGNATURE_STEP,
      },
      signatureMode: {
        inPerson: { current: 0, previous: null },
        remote: { current: 0, previous: null },
        proxy: { current: 0, previous: null },
      },
      loanDuration: {
        count: 0,
        avgDays: { current: null, previous: null },
        medianDays: { current: null, previous: null },
      },
      waiting: {
        thresholdDays: 0,
        overdueTotal: 0,
        steps: [],
      },
    });
  }
}
