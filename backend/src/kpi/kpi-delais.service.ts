import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod } from './kpi-period';
import { KpiDelaisResponse } from './kpi-types';
import {
  DelaisRange,
  queryCreationToSend,
  queryLoanDuration,
  querySendToSignature,
  querySentSeries,
  querySeriesFromBons,
  queryStatusBreakdown,
  queryVolumeAggregate,
  queryWaitingSteps,
} from './delais/delais-queries';
import {
  buildCreationToSend,
  buildLoanDuration,
  buildSendToSignature,
  buildStatusBreakdown,
  buildVolumes,
  buildWaiting,
} from './delais/delais-mappers';

/**
 * `GET /kpi/delais` — volumes, répartition par statut, délais de traitement
 * (création → envoi, envoi → signature, durée de prêt) et étapes en attente.
 *
 * Ce service ne fait que l'orchestration (résolution du seuil de retard,
 * lancement des requêtes en parallèle, assemblage de l'enveloppe) : le SQL
 * brut vit dans `delais/delais-queries.ts`, la mise en forme pure dans
 * `delais/delais-mappers.ts` — séparation nécessaire pour rester sous les
 * 400 lignes par fichier imposées au lot.
 */
@Injectable()
export class KpiDelaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  async getDelais(period: KpiPeriod, filialeId?: string): Promise<KpiDelaisResponse> {
    const thresholdDays = await this.configService.getSignatureOverdueDays();
    const current: DelaisRange = { from: period.from, to: period.to };
    const previous: DelaisRange = { from: period.previous.from, to: period.previous.to };

    const [
      volumeCurrent,
      volumePrevious,
      createdSeriesRows,
      sentSeriesRows,
      archivedSeriesRows,
      statusRows,
      creationToSendCurrent,
      creationToSendPrevious,
      sendToSignatureCurrentRows,
      sendToSignaturePreviousRows,
      loanDurationCurrent,
      loanDurationPrevious,
      waitingRows,
    ] = await Promise.all([
      queryVolumeAggregate(this.prisma, current, filialeId),
      queryVolumeAggregate(this.prisma, previous, filialeId),
      querySeriesFromBons(this.prisma, Prisma.sql`b.created_at`, current, period.granularity, filialeId),
      querySentSeries(this.prisma, current, period.granularity, filialeId),
      querySeriesFromBons(this.prisma, Prisma.sql`b.archived_at`, current, period.granularity, filialeId),
      queryStatusBreakdown(this.prisma, filialeId),
      queryCreationToSend(this.prisma, current, filialeId),
      queryCreationToSend(this.prisma, previous, filialeId),
      querySendToSignature(this.prisma, current, filialeId),
      querySendToSignature(this.prisma, previous, filialeId),
      queryLoanDuration(this.prisma, current, filialeId),
      queryLoanDuration(this.prisma, previous, filialeId),
      queryWaitingSteps(this.prisma, thresholdDays, filialeId),
    ]);

    const { sendToSignature, signatureMode } = buildSendToSignature(
      sendToSignatureCurrentRows,
      sendToSignaturePreviousRows,
    );

    return {
      period: { from: period.from, to: period.to, granularity: period.granularity, days: period.days },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      volumes: buildVolumes(period, volumeCurrent, volumePrevious, createdSeriesRows, sentSeriesRows, archivedSeriesRows),
      statusBreakdown: buildStatusBreakdown(statusRows),
      creationToSend: buildCreationToSend(creationToSendCurrent, creationToSendPrevious),
      sendToSignature,
      signatureMode,
      loanDuration: buildLoanDuration(loanDurationCurrent, loanDurationPrevious),
      waiting: buildWaiting(thresholdDays, waitingRows),
    };
  }
}
