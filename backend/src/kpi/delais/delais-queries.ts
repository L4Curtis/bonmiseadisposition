import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PARTIAL_PENDING_SIGNATURE_TYPES, awaitingSignatureSql, overdueSignatureSql } from '../../common/bon-predicates';
import { SIGNATURE_LINK_BON_STATUSES } from '../../bons/bon-status';
import { Granularity } from '../kpi-types';
import { parisBucketSql, parisPeriodSql } from '../../common/dates/paris';
import { filialeFilter, toNumber } from '../kpi-sql';
import { countSourceSql } from '../lists/kpi-list-sources';
import { IT_ROLES } from '../../common/roles';

/**
 * Requêtes SQL brutes de `GET /kpi/delais` (lot 2b). Chaque fonction isole un
 * fragment `Prisma.sql` et son type de ligne brute ; la mise en forme (labels,
 * ratios, fusion cur/prev) vit dans `delais-mappers.ts`, l'orchestration dans
 * `kpi-delais.service.ts`. Séparation nécessaire pour rester sous 400 lignes.
 */

export type DelaisRange = { from: string; to: string };

/** Types de signature « collaborateur » suivis par le délai envoi → signature. */
const SEND_TO_SIGNATURE_TYPES = ['mise_disposition', 'restitution', 'pv_cloture'] as const;

// ── volumes ──────────────────────────────────────────────────────────────

export interface VolumeAggregate {
  created: number;
  sent: number;
  archived: number;
  cancelled: number;
}

interface VolumeAggregateRow {
  created: bigint;
  sent: bigint;
  archived: bigint;
  cancelled: bigint;
}

/** Compteurs de volumes (créés / envoyés / archivés / annulés) sur une
 *  période : le nombre de lignes des listes qu'ouvrent ces cartes
 *  (lists/kpi-list-sources.ts). */
export async function queryVolumeAggregate(
  prisma: PrismaService,
  range: DelaisRange,
  filialeId?: string,
): Promise<VolumeAggregate> {
  const rows = await prisma.$queryRaw<VolumeAggregateRow[]>(Prisma.sql`
    SELECT
      ${countSourceSql('bons_crees', range, filialeId)} AS created,
      ${countSourceSql('bons_envoyes', range, filialeId)} AS sent,
      ${countSourceSql('bons_clotures', range, filialeId)} AS archived,
      ${countSourceSql('bons_annules', range, filialeId)} AS cancelled
  `);
  const row = rows[0];
  return {
    created: toNumber(row?.created),
    sent: toNumber(row?.sent),
    archived: toNumber(row?.archived),
    cancelled: toNumber(row?.cancelled),
  };
}

export interface SeriesRow {
  bucket: Date | string;
  count: bigint;
}

/** Série d'un flux directement porté par `bons` (created_at / archived_at). */
export async function querySeriesFromBons(
  prisma: PrismaService,
  column: Prisma.Sql,
  range: DelaisRange,
  granularity: Granularity,
  filialeId?: string,
): Promise<SeriesRow[]> {
  return prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
    SELECT ${parisBucketSql(column, granularity)} AS bucket, COUNT(*)::bigint AS count
    FROM bons b
    WHERE ${parisPeriodSql(column, range)} ${filialeFilter('b', filialeId)}
    GROUP BY bucket
    ORDER BY bucket
  `);
}

/** Série des envois (`audit_logs.action = 'bon_sent'`, bons distincts). */
export async function querySentSeries(
  prisma: PrismaService,
  range: DelaisRange,
  granularity: Granularity,
  filialeId?: string,
): Promise<SeriesRow[]> {
  return prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
    SELECT ${parisBucketSql(Prisma.sql`a.created_at`, granularity)} AS bucket, COUNT(DISTINCT a.bon_id)::bigint AS count
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE a.action = 'bon_sent' AND ${parisPeriodSql(Prisma.sql`a.created_at`, range)} ${filialeFilter('b', filialeId)}
    GROUP BY bucket
    ORDER BY bucket
  `);
}

// ── statusBreakdown ──────────────────────────────────────────────────────

export interface StatusRow {
  status: string;
  count: bigint;
}

/** Répartition instantanée des bons par statut (tous statuts, aucun filtre de période). */
export async function queryStatusBreakdown(prisma: PrismaService, filialeId?: string): Promise<StatusRow[]> {
  return prisma.$queryRaw<StatusRow[]>(Prisma.sql`
    SELECT b.status::text AS status, COUNT(*)::bigint AS count
    FROM bons b
    WHERE 1 = 1 ${filialeFilter('b', filialeId)}
    GROUP BY b.status::text
  `);
}

// ── creationToSend ───────────────────────────────────────────────────────

export interface CreationToSendAggregate {
  count: number;
  medianHours: number | null;
  p90Hours: number | null;
}

interface CreationToSendRow {
  count: bigint;
  medianHours: unknown;
  p90Hours: unknown;
}

/** Délai création → premier envoi (CTE `first_sent`), médiane/p90 en heures. */
export async function queryCreationToSend(
  prisma: PrismaService,
  range: DelaisRange,
  filialeId?: string,
): Promise<CreationToSendAggregate> {
  const rows = await prisma.$queryRaw<CreationToSendRow[]>(Prisma.sql`
    WITH first_sent AS (
      SELECT bon_id, MIN(created_at) AS sent_at
      FROM audit_logs
      WHERE action = 'bon_sent'
      GROUP BY bon_id
    )
    SELECT
      COUNT(*)::bigint AS count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY h)::float8 AS "medianHours",
      percentile_cont(0.9) WITHIN GROUP (ORDER BY h)::float8 AS "p90Hours"
    FROM (
      SELECT EXTRACT(EPOCH FROM (fs.sent_at - b.created_at))::float8 / 3600 AS h
      FROM first_sent fs
      JOIN bons b ON b.id = fs.bon_id
      WHERE ${parisPeriodSql(Prisma.sql`fs.sent_at`, range)} ${filialeFilter('b', filialeId)}
    ) t
  `);
  const row = rows[0];
  return {
    count: toNumber(row?.count),
    medianHours: row?.medianHours == null ? null : toNumber(row.medianHours),
    p90Hours: row?.p90Hours == null ? null : toNumber(row.p90Hours),
  };
}

// ── sendToSignature + signatureMode ─────────────────────────────────────

export interface SendToSignatureRow {
  type: string;
  count: bigint;
  medianHours: unknown;
  p90Hours: unknown;
  within48h: bigint;
  within7d: bigint;
  inPerson: bigint;
  proxy: bigint;
}

/** Délai envoi → signature + mode de signature, groupé par type de signature.
 *  Départ = première demande email postérieure à la signature précédente du
 *  même type (`LAG` par bon/type), repli sur `created_at` (présentiel). */
export async function querySendToSignature(
  prisma: PrismaService,
  range: DelaisRange,
  filialeId?: string,
): Promise<SendToSignatureRow[]> {
  return prisma.$queryRaw<SendToSignatureRow[]>(Prisma.sql`
    WITH signed AS (
      -- Mandataire : signature au guichet par un compte ni titulaire ni IT.
      -- Un compte IT connecté sur l'appareil est un témoin (le titulaire
      -- signe devant lui) : exclu, y compris pour les signatures enregistrées
      -- avant cette règle, dont le sceau interdit de corriger la colonne.
      SELECT s.bon_id, s.type::text AS type, s.signed_at, s.created_at, s.is_in_person,
             (s.signed_by_proxy AND NOT EXISTS (
               SELECT 1 FROM users u
               WHERE lower(u.email) = lower(s.signer_email) AND u.role::text IN (${Prisma.join([...IT_ROLES])})
             )) AS signed_by_proxy,
             LAG(s.signed_at) OVER (PARTITION BY s.bon_id, s.type ORDER BY s.signed_at) AS prev_signed_at
      FROM signatures s
      WHERE s.signed AND s.signed_at IS NOT NULL AND s.type::text IN (${Prisma.join(SEND_TO_SIGNATURE_TYPES)})
    )
    SELECT
      x.type AS type,
      COUNT(*)::bigint AS count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY x.hours)::float8 AS "medianHours",
      percentile_cont(0.9) WITHIN GROUP (ORDER BY x.hours)::float8 AS "p90Hours",
      COUNT(*) FILTER (WHERE x.hours <= 48)::bigint AS "within48h",
      COUNT(*) FILTER (WHERE x.hours <= 168)::bigint AS "within7d",
      COUNT(*) FILTER (WHERE x.is_in_person)::bigint AS "inPerson",
      COUNT(*) FILTER (WHERE x.signed_by_proxy)::bigint AS proxy
    FROM (
      SELECT sg.*, GREATEST(0, EXTRACT(EPOCH FROM (sg.signed_at - COALESCE(st.first_request, sg.created_at)))::float8 / 3600) AS hours
      FROM signed sg
      JOIN bons b ON b.id = sg.bon_id
      LEFT JOIN LATERAL (
        SELECT MIN(nl.sent_at) AS first_request
        FROM notification_logs nl
        WHERE nl.bon_id = sg.bon_id
          AND nl.status::text = 'sent'
          AND nl.type::text = CASE sg.type
            WHEN 'mise_disposition' THEN 'mise_dispo_request'
            WHEN 'restitution' THEN 'restitution_request'
            ELSE 'pv_cloture_request'
          END
          AND nl.sent_at <= sg.signed_at
          AND nl.sent_at > COALESCE(sg.prev_signed_at, '-infinity'::timestamp)
      ) st ON true
      WHERE ${parisPeriodSql(Prisma.sql`sg.signed_at`, range)} ${filialeFilter('b', filialeId)}
    ) x
    GROUP BY x.type
  `);
}

// ── loanDuration ─────────────────────────────────────────────────────────

export interface LoanDurationAggregate {
  count: number;
  avgDays: number | null;
  medianDays: number | null;
}

interface LoanDurationRow {
  count: bigint;
  avgDays: unknown;
  medianDays: unknown;
}

/** Durée de prêt des bons archivés sur la période (début = 1ʳᵉ signature
 *  mise_disposition, repli `date_mise_disposition`). */
export async function queryLoanDuration(
  prisma: PrismaService,
  range: DelaisRange,
  filialeId?: string,
): Promise<LoanDurationAggregate> {
  const rows = await prisma.$queryRaw<LoanDurationRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS count,
      AVG(d)::float8 AS "avgDays",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d)::float8 AS "medianDays"
    FROM (
      SELECT EXTRACT(EPOCH FROM (b.archived_at - COALESCE(ls.loan_start, b.date_mise_disposition::timestamp)))::float8 / 86400 AS d
      FROM bons b
      LEFT JOIN LATERAL (
        SELECT MIN(s.signed_at) AS loan_start
        FROM signatures s
        WHERE s.bon_id = b.id AND s.type::text = 'mise_disposition' AND s.signed
      ) ls ON true
      WHERE b.archived_at IS NOT NULL AND ${parisPeriodSql(Prisma.sql`b.archived_at`, range)} ${filialeFilter('b', filialeId)}
    ) t
  `);
  const row = rows[0];
  return {
    count: toNumber(row?.count),
    avgDays: row?.avgDays == null ? null : toNumber(row.avgDays),
    medianDays: row?.medianDays == null ? null : toNumber(row.medianDays),
  };
}

// ── waiting ──────────────────────────────────────────────────────────────

export interface WaitingRow {
  step: string;
  count: bigint;
  avgAgeDays: unknown;
  overdue: bigint;
}

/** Signatures attendues par étape (état du jour). Même prédicat que la tuile
 *  « Signatures attendues » (`awaitingSignatureSql`) et que « Signature en
 *  retard » (`overdueSignatureSql`) : sans filtre filiale, la somme des
 *  `count` égale `GET /bons?awaitingSignature=1` et celle des `overdue`
 *  `GET /bons?overdue=1`. L'ancienneté se mesure depuis la demande
 *  (`awaiting_since`), jamais depuis la dernière modification. L'étape d'une
 *  restitution en cours est celle de sa dernière demande ouverte. */
export async function queryWaitingSteps(
  prisma: PrismaService,
  thresholdDays: number,
  now: Date,
  filialeId?: string,
): Promise<WaitingRow[]> {
  return prisma.$queryRaw<WaitingRow[]>(Prisma.sql`
    SELECT
      CASE b.status::text
        WHEN 'sent_mise_dispo' THEN 'mise_disposition'
        WHEN 'sent_restitution' THEN 'restitution'
        ELSE ps.type
      END AS step,
      COUNT(*)::bigint AS count,
      AVG(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') - b.awaiting_since) / 86400)::float8 AS "avgAgeDays",
      COUNT(*) FILTER (WHERE ${overdueSignatureSql(thresholdDays, now)})::bigint AS overdue
    FROM bons b
    LEFT JOIN LATERAL (
      SELECT s.type::text AS type
      FROM signatures s
      WHERE s.bon_id = b.id AND s.signed = false AND s.invalidated_at IS NULL
        AND s.type::text IN (${Prisma.join(PARTIAL_PENDING_SIGNATURE_TYPES)})
        AND s.token_expires_at > to_timestamp(1) AT TIME ZONE 'UTC'
      ORDER BY s.created_at DESC
      LIMIT 1
    ) ps ON true
    WHERE b.status::text IN (${Prisma.join(SIGNATURE_LINK_BON_STATUSES)})
      AND ${awaitingSignatureSql()}
    ${filialeFilter('b', filialeId)}
    GROUP BY 1
  `);
}
