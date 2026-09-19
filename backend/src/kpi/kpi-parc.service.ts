import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod, buildBuckets, fillSeries } from './kpi-period';
import {
  KpiParcResponse,
  ParcCategoryCount,
  ParcFilialeCount,
  ParcTopModel,
  ParcReturnOverdueItem,
  SeriesPoint,
} from './kpi-types';
import { toNumber, ratio, compared, bucketLabel } from './kpi-sql';
import { CATEGORY_LABELS, buildSituationBreakdown } from '../common/bon-predicates';
import {
  LoanedTotalsRow,
  CategoryRow,
  FilialeRow,
  SituationRow,
  TopModelRow,
  ShareCountsRow,
  SeriesRow,
  OverdueAggregateRow,
  OverdueTopRow,
  NotReturnedFlowRow,
  ClosedShareRow,
  OpenNowRow,
  loanedTotalsQuery,
  loanedByCategoryQuery,
  loanedByFilialeQuery,
  loanedBySituationQuery,
  topModelsQuery,
  shareCountsQuery,
  loanedSeriesQuery,
  returnOverdueAggregateQuery,
  returnOverdueTopQuery,
  notReturnedFlowsQuery,
  closedBonsShareQuery,
  notReturnedOpenNowQuery,
} from './kpi-parc.queries';

/**
 * `GET /kpi/parc` — parc en circulation (définition élargie, cf.
 * PARC_BON_STATUSES dans bon-predicates.ts), retards de restitution, non-rendus.
 *
 * Chaque bloc de la réponse est calculé par une requête SQL dédiée
 * (`Prisma.sql`, jamais de concaténation), exécutées en parallèle. Toutes
 * filtrent sur `filialeFilter('b', filialeId)` et castent les colonnes enum
 * (`b.status`, `ec.category`, `s.type`) en texte — voir kpi-design.md. Le
 * texte des requêtes vit dans `kpi-parc.queries.ts` (fonctions pures) ; ce
 * fichier orchestre leur exécution en parallèle et construit l'enveloppe de
 * réponse.
 *
 * `loaned.total` doit toujours égaler `/reporting/inventory/summary.total`
 * (sans filiale) : les deux services partagent `parcEquipmentSql()`.
 */
@Injectable()
export class KpiParcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  async getParc(period: KpiPeriod, filialeId?: string): Promise<KpiParcResponse> {
    const currentRange = { from: period.from, to: period.to };

    const [
      totalsRows,
      categoryRows,
      filialeRows,
      situationRows,
      topModelRows,
      shareRows,
      seriesRows,
      overdueAggregateRows,
      overdueTopRows,
      notReturnedCurrentRows,
      notReturnedPreviousRows,
      closedShareCurrentRows,
      closedSharePreviousRows,
      openNowRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<LoanedTotalsRow[]>(loanedTotalsQuery(filialeId)),
      this.prisma.$queryRaw<CategoryRow[]>(loanedByCategoryQuery(filialeId)),
      this.prisma.$queryRaw<FilialeRow[]>(loanedByFilialeQuery(filialeId)),
      this.prisma.$queryRaw<SituationRow[]>(loanedBySituationQuery(filialeId)),
      this.prisma.$queryRaw<TopModelRow[]>(topModelsQuery(filialeId)),
      this.prisma.$queryRaw<ShareCountsRow[]>(shareCountsQuery(filialeId)),
      this.prisma.$queryRaw<SeriesRow[]>(loanedSeriesQuery(period, filialeId)),
      this.prisma.$queryRaw<OverdueAggregateRow[]>(returnOverdueAggregateQuery(filialeId)),
      this.prisma.$queryRaw<OverdueTopRow[]>(returnOverdueTopQuery(filialeId)),
      this.prisma.$queryRaw<NotReturnedFlowRow[]>(notReturnedFlowsQuery(currentRange, filialeId)),
      this.prisma.$queryRaw<NotReturnedFlowRow[]>(notReturnedFlowsQuery(period.previous, filialeId)),
      this.prisma.$queryRaw<ClosedShareRow[]>(closedBonsShareQuery(currentRange, filialeId)),
      this.prisma.$queryRaw<ClosedShareRow[]>(closedBonsShareQuery(period.previous, filialeId)),
      this.prisma.$queryRaw<OpenNowRow[]>(notReturnedOpenNowQuery(filialeId)),
    ]);

    const totalEquipments = toNumber(totalsRows[0]?.total);
    const offCatalog = toNumber(shareRows[0]?.offCatalog);
    const withSerial = toNumber(shareRows[0]?.withSerial);

    const buckets = buildBuckets(currentRange, period.granularity);
    const seriesPoints: SeriesPoint[] = seriesRows.map((row) => ({
      bucket: bucketLabel(row.bucket),
      count: toNumber(row.count),
    }));

    const notReturnedCurrent = notReturnedCurrentRows[0];
    const notReturnedPrevious = notReturnedPreviousRows[0];
    const closedCurrent = closedShareCurrentRows[0];
    const closedPrevious = closedSharePreviousRows[0];
    const overdueAggregate = overdueAggregateRows[0];

    return {
      period: { from: period.from, to: period.to, granularity: period.granularity, days: period.days },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      loaned: {
        total: totalEquipments,
        bons: toNumber(totalsRows[0]?.bons),
        byCategory: categoryRows.map(
          (row): ParcCategoryCount => ({
            category: row.category,
            label: CATEGORY_LABELS[row.category] ?? row.category,
            count: toNumber(row.count),
          }),
        ),
        byFiliale: filialeRows.map(
          (row): ParcFilialeCount => ({
            filialeId: row.filialeId,
            name: row.name,
            count: toNumber(row.count),
          }),
        ),
        bySituation: buildSituationBreakdown(
          situationRows.map((row) => ({ situation: row.situation, count: toNumber(row.count) })),
        ),
        topModels: topModelRows.map(
          (row): ParcTopModel => ({
            catalogItemId: row.catalogItemId,
            label: `${row.brand} ${row.model}`,
            category: row.category,
            count: toNumber(row.count),
          }),
        ),
        offCatalogShare: ratio(offCatalog, totalEquipments),
        serialCoverage: ratio(withSerial, totalEquipments),
        series: fillSeries(buckets, seriesPoints, 'count', 0),
      },
      returnOverdue: {
        bons: toNumber(overdueAggregate?.bons),
        equipments: toNumber(overdueAggregate?.equipments),
        avgDays: overdueAggregate?.avgDays == null ? null : toNumber(overdueAggregate.avgDays),
        medianDays: overdueAggregate?.medianDays == null ? null : toNumber(overdueAggregate.medianDays),
        top: overdueTopRows.map(
          (row): ParcReturnOverdueItem => ({
            bonId: row.bonId,
            reference: row.reference,
            filiale: row.filiale,
            collaborateur: row.collaborateur,
            dateRestitution: bucketLabel(row.dateRestitution),
            daysLate: toNumber(row.daysLate),
            equipments: toNumber(row.equipments),
          }),
        ),
      },
      notReturned: {
        declared: compared(toNumber(notReturnedCurrent?.declared), toNumber(notReturnedPrevious?.declared)),
        found: compared(toNumber(notReturnedCurrent?.found), toNumber(notReturnedPrevious?.found)),
        closedBonsShare: {
          current: ratio(toNumber(closedCurrent?.withNotReturned), toNumber(closedCurrent?.archived)),
          previous: ratio(toNumber(closedPrevious?.withNotReturned), toNumber(closedPrevious?.archived)),
        },
        openNow: toNumber(openNowRows[0]?.count),
      },
    };
  }
}
