import { Prisma } from '@prisma/client';
import { parisPeriodSql } from '../../common/dates/paris';
import { filialeFilter } from '../kpi-sql';

/**
 * Sources des chiffres « sur la période » qui comptent des bons ou des
 * événements (onglets Délais et Incidents). Chaque source est une requête qui
 * rend UNE LIGNE PAR ÉLÉMENT COMPTÉ ; la carte en compte les lignes
 * (`countSourceSql`) et la liste du chiffre (`GET /kpi/liste`) les affiche :
 * la carte et sa liste lisent la même requête, elles ne peuvent pas diverger.
 *
 * Colonnes rendues : `row_id` (unique dans la source), `bon_id`, `at` (date de
 * l'élément), `detail` (texte brut propre à la source, ou NULL).
 */

export const KPI_LIST_KEYS = [
  'bons_crees',
  'bons_envoyes',
  'bons_clotures',
  'bons_annules',
  'pv_emis',
  'remises_sans_signature',
  'clotures_sans_signature',
  'contestations_recues',
  'emails_en_echec',
] as const;
export type KpiListKey = (typeof KPI_LIST_KEYS)[number];

export type ListRange = { from: string; to: string };

/** Actions du journal qui constatent une remise sans signature (bon « Remise à
 *  signer » → « En cours ») : la nouvelle action de la vague 2, ou l'ancienne
 *  action unique `bon_closed_unilateral` quand elle menait à `active`. */
export const HANDOVER_SQL = Prisma.sql`(a.action = 'bon_handover_without_signature'
  OR (a.action = 'bon_closed_unilateral' AND a.details->>'to' = 'active'))`;

/** Clôtures sans signature (→ « Clôturé ») : nouvelle action, ou l'ancienne
 *  action unique quand elle menait ailleurs qu'à `active`. */
export const CLOSURE_SQL = Prisma.sql`(a.action = 'bon_closed_without_signature'
  OR (a.action = 'bon_closed_unilateral' AND COALESCE(a.details->>'to', '') <> 'active'))`;

const AUDIT_AT = Prisma.raw('a.created_at');

/** Bons dont la date `column` tombe dans la période (créés, clôturés). */
function bonsByDate(column: Prisma.Sql, range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id AS row_id, b.id AS bon_id, ${column} AS at, NULL::text AS detail
    FROM bons b
    WHERE ${parisPeriodSql(column, range)} ${filialeFilter('b', filialeId)}`;
}

/** Bons distincts ayant au moins une entrée `action` du journal sur la
 *  période, datés de la première. */
function bonsByAuditAction(action: string, detail: Prisma.Sql, range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT a.bon_id AS row_id, a.bon_id AS bon_id, MIN(a.created_at) AS at, ${detail} AS detail
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE a.action = ${action} AND ${parisPeriodSql(AUDIT_AT, range)} ${filialeFilter('b', filialeId)}
    GROUP BY a.bon_id, b.cancellation_reason`;
}

/** Une ligne par entrée du journal qui satisfait `predicate` sur la période. */
function auditEntries(predicate: Prisma.Sql, range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT a.id AS row_id, a.bon_id AS bon_id, a.created_at AS at,
           NULLIF(btrim(a.details->>'reason'), '') AS detail
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE ${predicate} AND ${parisPeriodSql(AUDIT_AT, range)} ${filialeFilter('b', filialeId)}`;
}

/** Contestations reçues (créées) sur la période ; `detail` = statut brut. */
function contestationsReceived(range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id AS row_id, c.bon_id AS bon_id, c.created_at AS at, c.status::text AS detail
    FROM contestations c
    JOIN bons b ON b.id = c.bon_id
    WHERE ${parisPeriodSql(Prisma.raw('c.created_at'), range)} ${filialeFilter('b', filialeId)}`;
}

/** Emails en échec sur la période : échec d'envoi ou rejet par le serveur du
 *  destinataire. Jamais `skipped` (bon sans adresse : rien à envoyer, ce n'est
 *  pas une panne), ni les anciennes lignes `failed` sans destinataire qui
 *  notaient ce même cas avant la vague 2. `detail` = « statut|adresse ». */
function failedEmails(range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT nl.id AS row_id, nl.bon_id AS bon_id, nl.sent_at AS at,
           nl.status::text || '|' || nl.recipient_email AS detail
    FROM notification_logs nl
    JOIN bons b ON b.id = nl.bon_id
    WHERE nl.status::text IN ('failed', 'bounced')
      AND btrim(nl.recipient_email) <> ''
      AND ${parisPeriodSql(Prisma.raw('nl.sent_at'), range)}
      ${filialeFilter('b', filialeId)}`;
}

/** Requête source d'un chiffre : une ligne par élément compté. */
export function listSourceSql(key: KpiListKey, range: ListRange, filialeId?: string): Prisma.Sql {
  switch (key) {
    case 'bons_crees':
      return bonsByDate(Prisma.raw('b.created_at'), range, filialeId);
    case 'bons_envoyes':
      return bonsByAuditAction('bon_sent', Prisma.sql`NULL::text`, range, filialeId);
    case 'bons_clotures':
      return bonsByDate(Prisma.raw('b.archived_at'), range, filialeId);
    case 'bons_annules':
      return bonsByAuditAction('bon_cancelled', Prisma.sql`b.cancellation_reason`, range, filialeId);
    case 'pv_emis':
      return auditEntries(Prisma.sql`a.action = 'pv_cloture_emitted'`, range, filialeId);
    case 'remises_sans_signature':
      return auditEntries(HANDOVER_SQL, range, filialeId);
    case 'clotures_sans_signature':
      return auditEntries(CLOSURE_SQL, range, filialeId);
    case 'contestations_recues':
      return contestationsReceived(range, filialeId);
    case 'emails_en_echec':
      return failedEmails(range, filialeId);
  }
}

/** Nombre de lignes d'une source : la valeur de la carte. */
export function countSourceSql(key: KpiListKey, range: ListRange, filialeId?: string): Prisma.Sql {
  return Prisma.sql`(SELECT COUNT(*)::bigint FROM (${listSourceSql(key, range, filialeId)}) AS src)`;
}
