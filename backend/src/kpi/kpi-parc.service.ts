import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { filialeFilter, inRange, stepInterval, toNumber, ratio, compared, bucketLabel } from './kpi-sql';
import { CATEGORY_LABELS, loanedEquipmentSql } from '../common/bon-predicates';

interface LoanedTotalsRow {
  total: bigint;
  bons: bigint;
}
interface CategoryRow {
  category: string;
  count: bigint;
}
interface FilialeRow {
  filialeId: string;
  name: string;
  count: bigint;
}
interface TopModelRow {
  catalogItemId: string;
  brand: string;
  model: string;
  category: string;
  count: bigint;
}
interface ShareCountsRow {
  offCatalog: bigint;
  withSerial: bigint;
}
interface SeriesRow {
  bucket: Date | string;
  count: bigint;
}
interface OverdueAggregateRow {
  bons: bigint;
  equipments: bigint;
  avgDays: unknown;
  medianDays: unknown;
}
interface OverdueTopRow {
  bonId: string;
  reference: string;
  filiale: string;
  collaborateur: string;
  dateRestitution: Date | string;
  daysLate: unknown;
  equipments: bigint;
}
interface NotReturnedFlowRow {
  declared: bigint;
  found: bigint;
}
interface ClosedShareRow {
  archived: bigint;
  withNotReturned: bigint;
}
interface OpenNowRow {
  count: bigint;
}

/**
 * `GET /kpi/parc` — parc prêté, retards de restitution, non-rendus.
 *
 * Chaque bloc de la réponse est calculé par une requête SQL dédiée
 * (`Prisma.sql`, jamais de concaténation), exécutées en parallèle. Toutes
 * filtrent sur `filialeFilter('b', filialeId)` et castent les colonnes enum
 * (`b.status`, `ec.category`, `s.type`) en texte — voir kpi-design.md.
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
      this.prisma.$queryRaw<LoanedTotalsRow[]>(this.loanedTotalsQuery(filialeId)),
      this.prisma.$queryRaw<CategoryRow[]>(this.loanedByCategoryQuery(filialeId)),
      this.prisma.$queryRaw<FilialeRow[]>(this.loanedByFilialeQuery(filialeId)),
      this.prisma.$queryRaw<TopModelRow[]>(this.topModelsQuery(filialeId)),
      this.prisma.$queryRaw<ShareCountsRow[]>(this.shareCountsQuery(filialeId)),
      this.prisma.$queryRaw<SeriesRow[]>(this.loanedSeriesQuery(period, filialeId)),
      this.prisma.$queryRaw<OverdueAggregateRow[]>(this.returnOverdueAggregateQuery(filialeId)),
      this.prisma.$queryRaw<OverdueTopRow[]>(this.returnOverdueTopQuery(filialeId)),
      this.prisma.$queryRaw<NotReturnedFlowRow[]>(this.notReturnedFlowsQuery(currentRange, filialeId)),
      this.prisma.$queryRaw<NotReturnedFlowRow[]>(this.notReturnedFlowsQuery(period.previous, filialeId)),
      this.prisma.$queryRaw<ClosedShareRow[]>(this.closedBonsShareQuery(currentRange, filialeId)),
      this.prisma.$queryRaw<ClosedShareRow[]>(this.closedBonsShareQuery(period.previous, filialeId)),
      this.prisma.$queryRaw<OpenNowRow[]>(this.notReturnedOpenNowQuery(filialeId)),
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

  // ── requêtes ────────────────────────────────────────────────────────────

  /** Total d'équipements prêtés + nombre de bons distincts concernés. */
  private loanedTotalsQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT COUNT(be.id)::bigint AS total, COUNT(DISTINCT b.id)::bigint AS bons
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      WHERE ${loanedEquipmentSql()}
      ${filialeFilter('b', filialeId)}
    `;
  }

  /** Répartition du parc prêté par catégorie (COALESCE 'autre' si sans fiche catalogue). */
  private loanedByCategoryQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT COALESCE(ec.category::text, 'autre') AS category, COUNT(*)::bigint AS count
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      LEFT JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
      WHERE ${loanedEquipmentSql()}
      ${filialeFilter('b', filialeId)}
      GROUP BY COALESCE(ec.category::text, 'autre')
      ORDER BY count DESC
    `;
  }

  /** Répartition du parc prêté par filiale. */
  private loanedByFilialeQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT f.id AS "filialeId", f.display_name AS name, COUNT(*)::bigint AS count
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      JOIN filiales f ON f.id = b.filiale_id
      WHERE ${loanedEquipmentSql()}
      ${filialeFilter('b', filialeId)}
      GROUP BY f.id, f.display_name
      ORDER BY count DESC
    `;
  }

  /** Top 10 des modèles de catalogue les plus prêtés. */
  private topModelsQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT ec.id AS "catalogItemId", ec.brand, ec.model, ec.category::text AS category, COUNT(*)::bigint AS count
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
      WHERE ${loanedEquipmentSql()}
      ${filialeFilter('b', filialeId)}
      GROUP BY ec.id, ec.brand, ec.model, ec.category
      ORDER BY count DESC
      LIMIT 10
    `;
  }

  /** Compteurs bruts pour `offCatalogShare` (sans fiche catalogue) et
   *  `serialCoverage` (numéro de série renseigné) — ratios calculés en JS
   *  sur `loaned.total` (dénominateur commun). */
  private shareCountsQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE be.catalog_item_id IS NULL)::bigint AS "offCatalog",
        COUNT(*) FILTER (WHERE btrim(COALESCE(be.serial_number, '')) <> '')::bigint AS "withSerial"
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      WHERE ${loanedEquipmentSql()}
      ${filialeFilter('b', filialeId)}
    `;
  }

  /** Série historique (estimation) du stock prêté en fin de bucket :
   *  `generate_series` aligné sur la granularité + début de prêt en LATERAL
   *  (`MIN(signed_at)` de la signature mise_disposition, repli
   *  `date_mise_disposition`) — voir kpi-design.md. */
  private loanedSeriesQuery(period: KpiPeriod, filialeId?: string): Prisma.Sql {
    const step = stepInterval(period.granularity);
    // Fin de bucket = minuit Paris du bucket suivant, ramené en timestamp naïf UTC
    // (même convention que parisStart) pour se comparer aux colonnes Prisma.
    const bucketEnd = Prisma.sql`((LEAST(bk.d + ${step}, ${period.to}::date + 1)::timestamp AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC')`;

    return Prisma.sql`
      WITH bk AS (
        SELECT generate_series(
          date_trunc(${period.granularity}, ${period.from}::date)::date,
          ${period.to}::date,
          ${step}
        )::date AS d
      )
      SELECT bk.d AS bucket, COUNT(be.id)::bigint AS count
      FROM bk
      LEFT JOIN (
        bon_equipments be
        JOIN bons b ON b.id = be.bon_id
        LEFT JOIN LATERAL (
          SELECT MIN(s.signed_at) AS loan_start
          FROM signatures s
          WHERE s.bon_id = b.id AND s.type::text = 'mise_disposition' AND s.signed
        ) ls ON true
      ) ON COALESCE(ls.loan_start, b.date_mise_disposition::timestamp) < ${bucketEnd}
        AND (be.returned_at IS NULL OR be.returned_at >= ${bucketEnd})
        AND (b.archived_at IS NULL OR b.archived_at >= ${bucketEnd})
        AND be.not_returned = false
        AND b.status::text <> 'cancelled'
        ${filialeFilter('b', filialeId)}
      GROUP BY bk.d
      ORDER BY bk.d
    `;
  }

  /** CTE partagée par `returnOverdueAggregateQuery` et `returnOverdueTopQuery` :
   *  un bon par ligne, équipements prêtés en retard de restitution regroupés,
   *  `days_late` = jours de retard (date civile Paris). */
  private lateBonsCte(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT b.id AS bon_id, b.reference, b.date_restitution, b.collaborateur_id, b.filiale_id,
             (now() AT TIME ZONE 'Europe/Paris')::date - b.date_restitution AS days_late,
             COUNT(be.id)::bigint AS equipments
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      WHERE ${loanedEquipmentSql()}
        AND b.date_restitution IS NOT NULL
        AND b.date_restitution < (now() AT TIME ZONE 'Europe/Paris')::date
        ${filialeFilter('b', filialeId)}
      GROUP BY b.id, b.reference, b.date_restitution, b.collaborateur_id, b.filiale_id
    `;
  }

  /** Agrégat des retards de restitution : nombre de bons/équipements, moyenne
   *  et médiane des jours de retard. */
  private returnOverdueAggregateQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      WITH late AS (${this.lateBonsCte(filialeId)})
      SELECT
        COUNT(*)::bigint AS bons,
        COALESCE(SUM(equipments), 0)::bigint AS equipments,
        AVG(days_late)::float8 AS "avgDays",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY days_late)::float8 AS "medianDays"
      FROM late
    `;
  }

  /** Top 10 des bons en retard de restitution (les plus en retard d'abord),
   *  avec collaborateur et filiale. */
  private returnOverdueTopQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      WITH late AS (${this.lateBonsCte(filialeId)})
      SELECT
        late.bon_id AS "bonId", late.reference, f.display_name AS filiale, u.display_name AS collaborateur,
        late.date_restitution AS "dateRestitution", late.days_late AS "daysLate", late.equipments
      FROM late
      JOIN users u ON u.id = late.collaborateur_id
      JOIN filiales f ON f.id = late.filiale_id
      ORDER BY late.days_late DESC
      LIMIT 10
    `;
  }

  /** Flux « déclaré non rendu » / « retrouvé » (audits) sur une période
   *  donnée — appelée une fois pour la période courante et une fois pour la
   *  précédente. */
  private notReturnedFlowsQuery(range: { from: string; to: string }, filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE a.action IN ('declare_not_returned', 'declare_not_returned_partial'))::bigint AS declared,
        COUNT(*) FILTER (WHERE a.action IN ('mark_found', 'mark_found_partial'))::bigint AS found
      FROM audit_logs a
      JOIN bons b ON b.id = a.bon_id
      WHERE ${inRange(Prisma.sql`a.created_at`, range)}
      ${filialeFilter('b', filialeId)}
    `;
  }

  /** Part des bons archivés sur la période ayant au moins un équipement non
   *  rendu — appelée pour la période courante et la précédente. */
  private closedBonsShareQuery(range: { from: string; to: string }, filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT
        COUNT(*)::bigint AS archived,
        COUNT(*) FILTER (
          WHERE EXISTS (SELECT 1 FROM bon_equipments be WHERE be.bon_id = b.id AND be.not_returned = true)
        )::bigint AS "withNotReturned"
      FROM bons b
      WHERE ${inRange(Prisma.sql`b.archived_at`, range)}
      ${filialeFilter('b', filialeId)}
    `;
  }

  /** État instantané : équipements déclarés non rendus sur un bon encore actif
   *  (ni archivé ni annulé). */
  private notReturnedOpenNowQuery(filialeId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM bon_equipments be
      JOIN bons b ON b.id = be.bon_id
      WHERE be.not_returned = true
        AND b.status::text NOT IN ('archived', 'cancelled')
        ${filialeFilter('b', filialeId)}
    `;
  }
}
