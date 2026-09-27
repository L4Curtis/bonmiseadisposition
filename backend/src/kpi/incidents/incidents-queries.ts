import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parisPeriodSql } from '../../common/dates/paris';
import { CONTESTATION_TO_PROCESS_STATUSES } from '../../common/bon-predicates';
import { filialeFilter, toNumber } from '../kpi-sql';

/**
 * Requêtes SQL de `GET /kpi/incidents`. Toutes sont des `COUNT` / `GROUP BY`
 * (jamais d'agrégation JS sur un `findMany`), castent chaque colonne enum en
 * `::text` et bornent les périodes à l'heure de Paris (`parisPeriodSql`).
 * La mise en forme de la réponse vit dans `kpi-incidents.service.ts`.
 */

export type Range = { from: string; to: string };

/** Actions du journal qui constatent une remise sans signature (bon « Remise à
 *  signer » → « En cours ») : la nouvelle action de la vague 2, ou l'ancienne
 *  action unique `bon_closed_unilateral` quand elle menait à `active`. */
const HANDOVER_SQL = Prisma.sql`(a.action = 'bon_handover_without_signature'
  OR (a.action = 'bon_closed_unilateral' AND a.details->>'to' = 'active'))`;

/** Clôtures sans signature (→ « Clôturé ») : nouvelle action, ou l'ancienne
 *  action unique quand elle menait ailleurs qu'à `active`. */
const CLOSURE_SQL = Prisma.sql`(a.action = 'bon_closed_without_signature'
  OR (a.action = 'bon_closed_unilateral' AND COALESCE(a.details->>'to', '') <> 'active'))`;

/** Nombre d'équipements d'une entrée du journal (`equipmentIds`), 1 à défaut. */
const EQUIPMENT_COUNT_SQL = Prisma.sql`COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(a.details->'equipmentIds') = 'array' THEN a.details->'equipmentIds' END), 1)`;

export interface AuditCounts {
  declared: number;
  found: number;
  pvEmitted: number;
  handovers: number;
  closures: number;
  cancelled: number;
}

/** Compteurs tirés du journal d'audit sur une période : équipements déclarés
 *  non restitués et retrouvés, PV émis, remises et clôtures sans signature,
 *  annulations (bons distincts). */
export async function queryAuditCounts(prisma: PrismaService, range: Range, filialeId?: string): Promise<AuditCounts> {
  const rows = await prisma.$queryRaw<Record<keyof AuditCounts, bigint>[]>(Prisma.sql`
    SELECT
      COALESCE(SUM(${EQUIPMENT_COUNT_SQL}) FILTER (WHERE a.action = 'declare_not_returned'), 0)::bigint AS declared,
      COALESCE(SUM(${EQUIPMENT_COUNT_SQL}) FILTER (WHERE a.action = 'mark_found'), 0)::bigint AS found,
      COUNT(*) FILTER (WHERE a.action = 'pv_cloture_emitted')::bigint AS "pvEmitted",
      COUNT(*) FILTER (WHERE ${HANDOVER_SQL})::bigint AS handovers,
      COUNT(*) FILTER (WHERE ${CLOSURE_SQL})::bigint AS closures,
      COUNT(DISTINCT a.bon_id) FILTER (WHERE a.action = 'bon_cancelled')::bigint AS cancelled
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE ${parisPeriodSql(Prisma.raw('a.created_at'), range)}
    ${filialeFilter('b', filialeId)}
  `);
  const row = rows[0];
  return {
    declared: toNumber(row?.declared),
    found: toNumber(row?.found),
    pvEmitted: toNumber(row?.pvEmitted),
    handovers: toNumber(row?.handovers),
    closures: toNumber(row?.closures),
    cancelled: toNumber(row?.cancelled),
  };
}

/** Motifs des remises (`kind = handover`) ou des clôtures sans signature, sur
 *  la période courante, dix au plus. */
export async function queryWithoutSignatureReasons(
  prisma: PrismaService,
  kind: 'handover' | 'closure',
  range: Range,
  filialeId?: string,
): Promise<{ reason: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ reason: string; count: bigint }[]>(Prisma.sql`
    SELECT COALESCE(NULLIF(btrim(a.details->>'reason'), ''), 'Non renseigné') AS reason, COUNT(*)::bigint AS count
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE ${kind === 'handover' ? HANDOVER_SQL : CLOSURE_SQL}
      AND ${parisPeriodSql(Prisma.raw('a.created_at'), range)}
      ${filialeFilter('b', filialeId)}
    GROUP BY 1
    ORDER BY count DESC, reason
    LIMIT 10
  `);
  return rows.map((r) => ({ reason: r.reason, count: toNumber(r.count) }));
}

export interface ContestationsFlow {
  received: number;
  decided: number;
  founded: number;
  notRetained: number;
  medianDays: number | null;
}

/** Date à laquelle une contestation a été tranchée (`resolved_at`, à défaut
 *  la dernière modification des contestations tranchées avant la vague 2). */
const DECIDED_AT_SQL = Prisma.sql`COALESCE(c.resolved_at, c.updated_at)`;
const DECIDED_SQL = Prisma.sql`c.status::text IN ('resolved', 'rejected')`;

/** Contestations reçues (création) et tranchées (issue Fondée / Non retenue)
 *  sur la période, délai médian entre réception et décision. */
export async function queryContestationsFlow(
  prisma: PrismaService,
  range: Range,
  filialeId?: string,
): Promise<ContestationsFlow> {
  const decidedInRange = Prisma.sql`${DECIDED_SQL} AND ${parisPeriodSql(DECIDED_AT_SQL, range)}`;
  const rows = await prisma.$queryRaw<Record<keyof ContestationsFlow, unknown>[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE ${parisPeriodSql(Prisma.raw('c.created_at'), range)})::bigint AS received,
      COUNT(*) FILTER (WHERE ${decidedInRange})::bigint AS decided,
      COUNT(*) FILTER (WHERE ${decidedInRange} AND COALESCE(c.outcome::text, CASE c.status::text WHEN 'resolved' THEN 'founded' ELSE 'not_retained' END) = 'founded')::bigint AS founded,
      COUNT(*) FILTER (WHERE ${decidedInRange} AND COALESCE(c.outcome::text, CASE c.status::text WHEN 'resolved' THEN 'founded' ELSE 'not_retained' END) = 'not_retained')::bigint AS "notRetained",
      (percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (${DECIDED_AT_SQL} - c.created_at))::float8 / 86400
      ) FILTER (WHERE ${decidedInRange}))::float8 AS "medianDays"
    FROM contestations c
    JOIN bons b ON b.id = c.bon_id
    WHERE true
    ${filialeFilter('b', filialeId)}
  `);
  const row = rows[0];
  return {
    received: toNumber(row?.received),
    decided: toNumber(row?.decided),
    founded: toNumber(row?.founded),
    notRetained: toNumber(row?.notRetained),
    medianDays: row?.medianDays == null ? null : toNumber(row.medianDays),
  };
}

/** « Contestations à traiter » : état du jour, même prédicat que l'accueil et
 *  que la page Contestations. */
export async function queryContestationsToProcess(prisma: PrismaService, filialeId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM contestations c
    JOIN bons b ON b.id = c.bon_id
    WHERE c.status::text IN (${Prisma.join(CONTESTATION_TO_PROCESS_STATUSES)})
    ${filialeFilter('b', filialeId)}
  `);
  return toNumber(rows[0]?.count);
}

/** Équipements encore non restitués aujourd'hui (déclarés et pas retrouvés),
 *  hors bons annulés : état du jour. */
export async function queryStillMissing(prisma: PrismaService, filialeId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE be.not_returned = true AND b.status::text <> 'cancelled'
    ${filialeFilter('b', filialeId)}
  `);
  return toNumber(rows[0]?.count);
}

export interface ReminderRankRow {
  rank: number;
  sent: bigint;
  signedAfter: bigint;
}

/** Rappels envoyés sur la période, par rang (le rang est compté PAR DOCUMENT
 *  depuis la vague 2) ; « signés après » = le même document signé après ce
 *  rappel, sans rappel plus récent du même document entre les deux. */
export async function queryRemindersByRank(
  prisma: PrismaService,
  range: Range,
  filialeId?: string,
): Promise<ReminderRankRow[]> {
  const rows = await prisma.$queryRaw<ReminderRankRow[]>(Prisma.sql`
    SELECT
      nl.reminder_number AS rank,
      COUNT(*)::bigint AS sent,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM signatures s
          WHERE s.bon_id = nl.bon_id AND s.signed AND s.signed_at > nl.sent_at
            AND (nl.document_type IS NULL OR s.type::text = nl.document_type::text)
            AND NOT EXISTS (
              SELECT 1 FROM notification_logs nl2
              WHERE nl2.bon_id = nl.bon_id AND nl2.type::text = 'reminder' AND nl2.status::text = 'sent'
                AND nl2.document_type IS NOT DISTINCT FROM nl.document_type
                AND nl2.sent_at > nl.sent_at AND nl2.sent_at < s.signed_at
            )
        )
      )::bigint AS "signedAfter"
    FROM notification_logs nl
    JOIN bons b ON b.id = nl.bon_id
    WHERE nl.type::text = 'reminder'
      AND nl.status::text = 'sent'
      AND nl.reminder_number IS NOT NULL
      AND ${parisPeriodSql(Prisma.raw('nl.sent_at'), range)}
      ${filialeFilter('b', filialeId)}
    GROUP BY nl.reminder_number
    ORDER BY nl.reminder_number
  `);
  return rows.map((r) => ({ rank: Number(r.rank), sent: r.sent, signedAfter: r.signedAfter }));
}

/** Documents (bon + type de document) ayant reçu leur 3ᵉ rappel sur la période. */
export async function queryDocumentsWithThreeReminders(
  prisma: PrismaService,
  range: Range,
  filialeId?: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT (nl.bon_id, COALESCE(nl.document_type::text, '')))::bigint AS count
    FROM notification_logs nl
    JOIN bons b ON b.id = nl.bon_id
    WHERE nl.type::text = 'reminder'
      AND nl.status::text = 'sent'
      AND nl.reminder_number >= 3
      AND ${parisPeriodSql(Prisma.raw('nl.sent_at'), range)}
      ${filialeFilter('b', filialeId)}
  `);
  return toNumber(rows[0]?.count);
}

/** Emails en échec sur la période : échec d'envoi ou rejet par le serveur du
 *  destinataire. Jamais `skipped` (bon sans adresse : rien à envoyer, ce n'est
 *  pas une panne), ni les anciennes lignes `failed` sans destinataire qui
 *  notaient ce même cas avant la vague 2. */
export async function queryFailedEmails(prisma: PrismaService, range: Range, filialeId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM notification_logs nl
    JOIN bons b ON b.id = nl.bon_id
    WHERE nl.status::text IN ('failed', 'bounced')
      AND btrim(nl.recipient_email) <> ''
      AND ${parisPeriodSql(Prisma.raw('nl.sent_at'), range)}
      ${filialeFilter('b', filialeId)}
  `);
  return toNumber(rows[0]?.count);
}
