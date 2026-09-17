import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { KpiPeriod } from './kpi-period';
import { compared, filialeFilter, inRange, ratio, toNumber } from './kpi-sql';
import { ClosureReason, KpiIncidentsResponse, ReminderRankStat } from './kpi-types';

type Range = { from: string; to: string };

interface AuditCountsRow {
  declared: bigint;
  found: bigint;
  pvEmitted: bigint;
  unilateral: bigint;
  cancelled: bigint;
}

interface AuditCounts {
  declared: number;
  found: number;
  pvEmitted: number;
  unilateral: number;
  cancelled: number;
}

interface ContestationsFlowRow {
  opened: bigint;
  closed: bigint;
  resolved: bigint;
  medianDays: number | null;
}

interface ContestationsFlow {
  opened: number;
  closed: number;
  resolved: number;
  medianDays: number | null;
}

interface ReminderRankRow {
  rank: number;
  sent: bigint;
  signedAfter: bigint;
}

/** Rangs toujours présents dans `reminders.byRank`, même sans rappel envoyé. */
const GUARANTEED_RANKS = [1, 2, 3];

/** `null`/`undefined` → `null` (contrairement à `toNumber`, qui les ramène à 0) :
 *  utilisé pour les agrégats dont l'absence de données est un vrai « pas de
 *  valeur » (médiane sur un ensemble vide), pas un zéro. */
function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

/**
 * `GET /kpi/incidents` — non-rendus, clôtures, contestations, rappels.
 *
 * Toutes les requêtes sont des `COUNT`/`GROUP BY` SQL (jamais d'agrégation
 * JS sur un `findMany`), avec cast `::text` sur chaque colonne enum comparée
 * (`c.status`, `nl.type`, `nl.status`) — voir kpi-design.md.
 */
@Injectable()
export class KpiIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  async getIncidents(period: KpiPeriod, filialeId?: string): Promise<KpiIncidentsResponse> {
    const currentRange: Range = { from: period.from, to: period.to };
    const previousRange: Range = period.previous;

    const [
      auditCurrent,
      auditPrevious,
      reasons,
      contestationsCurrent,
      contestationsPrevious,
      contestationsOpenNow,
      remindersCurrent,
      remindersPrevious,
      threeOrMoreCurrent,
      threeOrMorePrevious,
      failedCurrent,
      failedPrevious,
    ] = await Promise.all([
      this.auditCounts(currentRange, filialeId),
      this.auditCounts(previousRange, filialeId),
      this.unilateralReasons(currentRange, filialeId),
      this.contestationsFlow(currentRange, filialeId),
      this.contestationsFlow(previousRange, filialeId),
      this.contestationsOpenNow(filialeId),
      this.remindersByRank(currentRange, filialeId),
      this.remindersByRank(previousRange, filialeId),
      this.bonsWithThreeOrMore(currentRange, filialeId),
      this.bonsWithThreeOrMore(previousRange, filialeId),
      this.failedEmails(currentRange, filialeId),
      this.failedEmails(previousRange, filialeId),
    ]);

    return {
      period: { from: period.from, to: period.to, granularity: period.granularity, days: period.days },
      previous: { from: period.previous.from, to: period.previous.to },
      filialeId: filialeId ?? null,
      notReturned: {
        declared: compared(auditCurrent.declared, auditPrevious.declared),
        found: compared(auditCurrent.found, auditPrevious.found),
      },
      pvCloture: {
        emitted: compared(auditCurrent.pvEmitted, auditPrevious.pvEmitted),
      },
      unilateralClosures: {
        count: compared(auditCurrent.unilateral, auditPrevious.unilateral),
        reasons,
      },
      cancellations: {
        count: compared(auditCurrent.cancelled, auditPrevious.cancelled),
      },
      contestations: {
        opened: compared(contestationsCurrent.opened, contestationsPrevious.opened),
        openNow: contestationsOpenNow,
        closed: compared(contestationsCurrent.closed, contestationsPrevious.closed),
        resolutionMedianDays: {
          current: contestationsCurrent.medianDays,
          previous: contestationsPrevious.medianDays,
        },
        acceptanceRate: {
          current: ratio(contestationsCurrent.resolved, contestationsCurrent.closed),
          previous: ratio(contestationsPrevious.resolved, contestationsPrevious.closed),
        },
      },
      reminders: {
        byRank: this.buildReminderStats(remindersCurrent, remindersPrevious),
        bonsWithThreeOrMore: compared(threeOrMoreCurrent, threeOrMorePrevious),
      },
      failedEmails: {
        count: compared(failedCurrent, failedPrevious),
      },
    };
  }

  /** Compteurs d'audit en une requête `COUNT(*) FILTER` (une par période) :
   *  non-rendus déclarés/retrouvés (total + partiel), PV de clôture émis,
   *  clôtures unilatérales, annulations. */
  private async auditCounts(range: Range, filialeId?: string): Promise<AuditCounts> {
    const rows = await this.prisma.$queryRaw<AuditCountsRow[]>(Prisma.sql`
      SELECT
        -- declare_not_returned / mark_found sont toujours journalisés ; les
        -- variantes _partial sont des marqueurs SUPPLÉMENTAIRES (équipements
        -- restants) et ne doivent pas être comptées une seconde fois.
        COUNT(*) FILTER (WHERE a.action = 'declare_not_returned')::bigint AS declared,
        COUNT(*) FILTER (WHERE a.action = 'mark_found')::bigint AS found,
        COUNT(*) FILTER (WHERE a.action = 'pv_cloture_emitted')::bigint AS "pvEmitted",
        COUNT(*) FILTER (WHERE a.action = 'bon_closed_unilateral')::bigint AS unilateral,
        COUNT(*) FILTER (WHERE a.action = 'bon_cancelled')::bigint AS cancelled
      FROM audit_logs a
      JOIN bons b ON b.id = a.bon_id
      WHERE ${inRange(Prisma.raw('a.created_at'), range)}
      ${filialeFilter('b', filialeId)}
    `);
    const row = rows[0];
    return {
      declared: toNumber(row?.declared),
      found: toNumber(row?.found),
      pvEmitted: toNumber(row?.pvEmitted),
      unilateral: toNumber(row?.unilateral),
      cancelled: toNumber(row?.cancelled),
    };
  }

  /** Motifs de clôture unilatérale (période courante uniquement), top 10. */
  private async unilateralReasons(range: Range, filialeId?: string): Promise<ClosureReason[]> {
    const rows = await this.prisma.$queryRaw<{ reason: string; count: bigint }[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(btrim(a.details->>'reason'), ''), 'Non renseigné') AS reason,
        COUNT(*)::bigint AS count
      FROM audit_logs a
      JOIN bons b ON b.id = a.bon_id
      WHERE a.action = 'bon_closed_unilateral'
        AND ${inRange(Prisma.raw('a.created_at'), range)}
        ${filialeFilter('b', filialeId)}
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 10
    `);
    return rows.map((r) => ({ reason: r.reason, count: toNumber(r.count) }));
  }

  /** Contestations ouvertes/clôturées sur la période, délai médian de
   *  résolution et nombre de résolutions favorables (pour `acceptanceRate`).
   *  `opened` filtre sur `created_at`, `closed`/`resolved`/`medianDays` sur
   *  `updated_at` — les deux bornes sont donc exprimées en `FILTER`, pas en
   *  `WHERE`, pour ne pas les restreindre l'une l'autre. */
  private async contestationsFlow(range: Range, filialeId?: string): Promise<ContestationsFlow> {
    const rows = await this.prisma.$queryRaw<ContestationsFlowRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE ${inRange(Prisma.raw('c.created_at'), range)})::bigint AS opened,
        COUNT(*) FILTER (
          WHERE c.status::text IN ('resolved', 'rejected') AND ${inRange(Prisma.raw('c.updated_at'), range)}
        )::bigint AS closed,
        COUNT(*) FILTER (
          WHERE c.status::text = 'resolved' AND ${inRange(Prisma.raw('c.updated_at'), range)}
        )::bigint AS resolved,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (c.updated_at - c.created_at))::float8 / 86400
        ) FILTER (
          WHERE c.status::text IN ('resolved', 'rejected') AND ${inRange(Prisma.raw('c.updated_at'), range)}
        ) AS "medianDays"
      FROM contestations c
      JOIN bons b ON b.id = c.bon_id
      WHERE true
      ${filialeFilter('b', filialeId)}
    `);
    const row = rows[0];
    return {
      opened: toNumber(row?.opened),
      closed: toNumber(row?.closed),
      resolved: toNumber(row?.resolved),
      medianDays: toNullableNumber(row?.medianDays),
    };
  }

  /** Contestations actuellement ouvertes ou en cours d'instruction — état
   *  instantané, indépendant de la période. */
  private async contestationsOpenNow(filialeId?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM contestations c
      JOIN bons b ON b.id = c.bon_id
      WHERE c.status::text IN ('open', 'in_review')
      ${filialeFilter('b', filialeId)}
    `);
    return toNumber(rows[0]?.count);
  }

  /** Rappels envoyés par rang sur la période, et nombre de signatures
   *  survenues après un rappel donné sans qu'un rappel plus récent n'ait été
   *  envoyé entre-temps (formule EXISTS / NOT EXISTS de kpi-design.md). */
  private async remindersByRank(range: Range, filialeId?: string): Promise<ReminderRankRow[]> {
    const rows = await this.prisma.$queryRaw<{ rank: number; sent: bigint; signedAfter: bigint }[]>(Prisma.sql`
      SELECT
        nl.reminder_number AS rank,
        COUNT(*)::bigint AS sent,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM signatures s
            WHERE s.bon_id = nl.bon_id AND s.signed AND s.signed_at > nl.sent_at
              AND NOT EXISTS (
                SELECT 1 FROM notification_logs nl2
                WHERE nl2.bon_id = nl.bon_id AND nl2.type::text = 'reminder' AND nl2.status::text = 'sent'
                  AND nl2.sent_at > nl.sent_at AND nl2.sent_at < s.signed_at
              )
          )
        )::bigint AS "signedAfter"
      FROM notification_logs nl
      JOIN bons b ON b.id = nl.bon_id
      WHERE nl.type::text = 'reminder'
        AND nl.status::text = 'sent'
        AND nl.reminder_number IS NOT NULL
        AND ${inRange(Prisma.raw('nl.sent_at'), range)}
        ${filialeFilter('b', filialeId)}
      GROUP BY nl.reminder_number
      ORDER BY nl.reminder_number
    `);
    return rows.map((r) => ({ rank: Number(r.rank), sent: r.sent, signedAfter: r.signedAfter }));
  }

  /** Bons ayant reçu au moins 3 rappels envoyés sur la période. */
  private async bonsWithThreeOrMore(range: Range, filialeId?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT nl.bon_id)::bigint AS count
      FROM notification_logs nl
      JOIN bons b ON b.id = nl.bon_id
      WHERE nl.type::text = 'reminder'
        AND nl.status::text = 'sent'
        AND nl.reminder_number >= 3
        AND ${inRange(Prisma.raw('nl.sent_at'), range)}
        ${filialeFilter('b', filialeId)}
    `);
    return toNumber(rows[0]?.count);
  }

  /** Emails en échec d'envoi sur la période. */
  private async failedEmails(range: Range, filialeId?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM notification_logs nl
      JOIN bons b ON b.id = nl.bon_id
      WHERE nl.status::text = 'failed'
        AND ${inRange(Prisma.raw('nl.sent_at'), range)}
        ${filialeFilter('b', filialeId)}
    `);
    return toNumber(rows[0]?.count);
  }

  /** Fusionne les lignes courant/précédent par rang, garantit la présence
   *  des rangs 1 à 3 (à 0 si aucun rappel), conserve les rangs au-delà tels
   *  quels. `efficiency` ne compare pas courant/précédent : c'est un ratio
   *  du courant seul (`signedAfter.current / sent.current`). */
  private buildReminderStats(current: ReminderRankRow[], previous: ReminderRankRow[]): ReminderRankStat[] {
    const currentByRank = new Map(current.map((r) => [r.rank, r]));
    const previousByRank = new Map(previous.map((r) => [r.rank, r]));
    const ranks = new Set<number>([...GUARANTEED_RANKS, ...currentByRank.keys(), ...previousByRank.keys()]);

    return Array.from(ranks)
      .sort((a, b) => a - b)
      .map((rank) => {
        const sentCurrent = toNumber(currentByRank.get(rank)?.sent);
        const sentPrevious = toNumber(previousByRank.get(rank)?.sent);
        const signedAfterCurrent = toNumber(currentByRank.get(rank)?.signedAfter);
        const signedAfterPrevious = toNumber(previousByRank.get(rank)?.signedAfter);

        return {
          rank,
          sent: compared(sentCurrent, sentPrevious),
          signedAfter: compared(signedAfterCurrent, signedAfterPrevious),
          efficiency: ratio(signedAfterCurrent, sentCurrent),
        };
      });
  }
}
