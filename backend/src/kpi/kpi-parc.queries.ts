import { Prisma } from '@prisma/client';
import { KpiPeriod } from './kpi-period';
import { parisMidnightUtcSql, parisPeriodSql, parisTodaySql } from '../common/dates/paris';
import { filialeFilter, stepInterval } from './kpi-sql';
import { PARC_BON_STATUSES, parcEquipmentSql, situationCaseSql } from '../common/bon-predicates';
import { CLOSED_BON_STATUSES } from '../bons/bon-status';

/**
 * Requêtes SQL brutes de `KpiParcService.getParc` — extraites sans
 * changement de comportement (fonctions pures, `Prisma.Sql` en sortie,
 * jamais de concaténation de chaîne). Voir kpi-design.md pour le contexte
 * fonctionnel de chaque bloc.
 */

export interface LoanedTotalsRow {
  total: bigint;
  bons: bigint;
}
export interface CategoryRow {
  category: string;
  count: bigint;
}
export interface FilialeRow {
  filialeId: string;
  name: string;
  count: bigint;
}
export interface SituationRow {
  situation: string;
  count: bigint;
}
export interface TopModelRow {
  catalogItemId: string;
  brand: string;
  model: string;
  category: string;
  count: bigint;
}
export interface ShareCountsRow {
  offCatalog: bigint;
  withSerial: bigint;
}
export interface SeriesRow {
  bucket: Date | string;
  count: bigint;
}
export interface OverdueAggregateRow {
  bons: bigint;
  equipments: bigint;
  avgDays: unknown;
  medianDays: unknown;
}
export interface OverdueTopRow {
  bonId: string;
  reference: string;
  filiale: string;
  collaborateur: string;
  dateRestitution: Date | string;
  daysLate: unknown;
  equipments: bigint;
}
export interface NotReturnedFlowRow {
  declared: bigint;
  found: bigint;
}
export interface ClosedShareRow {
  archived: bigint;
  withNotReturned: bigint;
}
export interface OpenNowRow {
  count: bigint;
}

/** Total d'équipements en circulation (définition élargie, cf.
 *  PARC_BON_STATUSES) + nombre de bons distincts concernés. */
export function loanedTotalsQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(be.id)::bigint AS total, COUNT(DISTINCT b.id)::bigint AS bons
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
  `;
}

/** Répartition du parc en circulation par catégorie (COALESCE 'autre' si sans fiche catalogue). */
export function loanedByCategoryQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT COALESCE(ec.category::text, 'autre') AS category, COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    LEFT JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
    GROUP BY COALESCE(ec.category::text, 'autre')
    ORDER BY count DESC
  `;
}

/** Répartition du parc en circulation par filiale. */
export function loanedByFilialeQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT f.id AS "filialeId", f.display_name AS name, COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    JOIN filiales f ON f.id = b.filiale_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
    GROUP BY f.id, f.display_name
    ORDER BY count DESC
  `;
}

/** Répartition du parc en circulation par situation (en_attente_signature /
 *  en_circulation / en_litige) — la somme égale toujours `loaned.total`. */
export function loanedBySituationQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT ${situationCaseSql()} AS situation, COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
    -- GROUP BY 1 (position) et non l'expression répétée : Prisma lie les valeurs
    -- de chaque expression CASE comme des paramètres distincts, que Postgres
    -- ne reconnaît alors pas comme identiques (« column b.status must appear in
    -- the GROUP BY clause »).
    GROUP BY 1
  `;
}

/** Top 10 des modèles de catalogue les plus prêtés. */
export function topModelsQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT ec.id AS "catalogItemId", ec.brand, ec.model, ec.category::text AS category, COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    JOIN equipment_catalog ec ON ec.id = be.catalog_item_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
    GROUP BY ec.id, ec.brand, ec.model, ec.category
    ORDER BY count DESC
    LIMIT 10
  `;
}

/** Compteurs bruts pour `offCatalogShare` (sans fiche catalogue) et
 *  `serialCoverage` (numéro de série renseigné) — ratios calculés en JS
 *  sur `loaned.total` (dénominateur commun). */
export function shareCountsQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE be.catalog_item_id IS NULL)::bigint AS "offCatalog",
      COUNT(*) FILTER (WHERE btrim(COALESCE(be.serial_number, '')) <> '')::bigint AS "withSerial"
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE ${parcEquipmentSql()}
    ${filialeFilter('b', filialeId)}
  `;
}

/** Série historique (estimation) du stock en circulation en fin de bucket :
 *  `generate_series` aligné sur la granularité + début de prêt en LATERAL
 *  (`MIN(signed_at)` de la signature mise_disposition, repli
 *  `date_mise_disposition`) — voir kpi-design.md.
 *
 *  Alignée sur la même définition que `loanedTotalsQuery` (PARC_BON_STATUSES,
 *  audit du 2026-09-18) plutôt que « tout statut sauf cancelled » : sans cet
 *  alignement, un bon `contested` ou `sent_mise_dispo` apparaissait dans la
 *  série (statut ≠ cancelled) mais pas dans le total instantané (ancien
 *  LOANED_BON_STATUSES), faisant diverger le dernier point de la courbe et
 *  la tuile « total » sans raison métier. Le statut du bon n'étant connu
 *  qu'à l'instant présent (pas d'historique), un bon aujourd'hui `archived`
 *  reste compté sur les buckets antérieurs à son archivage effectif
 *  (`archived_at >= bucketEnd`) — au bucket le plus récent, cette branche est
 *  fausse pour un bon réellement déjà archivé, ce qui reproduit exactement
 *  `parcEquipmentSql()`. */
export function loanedSeriesQuery(period: KpiPeriod, filialeId?: string): Prisma.Sql {
  const step = stepInterval(period.granularity);
  // Fin de bucket = minuit Paris du bucket suivant, ramené en timestamp naïf UTC
  // pour se comparer aux colonnes Prisma.
  const bucketEnd = parisMidnightUtcSql(Prisma.sql`LEAST(bk.d + ${step}, ${period.to}::date + 1)`);

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
      AND be.not_returned = false
      AND (
        b.status::text IN (${Prisma.join(PARC_BON_STATUSES)})
        OR (b.status::text = 'archived' AND b.archived_at >= ${bucketEnd})
      )
      ${filialeFilter('b', filialeId)}
    GROUP BY bk.d
    ORDER BY bk.d
  `;
}

/** CTE partagée par `returnOverdueAggregateQuery` et `returnOverdueTopQuery` :
 *  un bon par ligne, équipements en circulation en retard de restitution
 *  regroupés (définition élargie, cf. PARC_BON_STATUSES — un bon
 *  `sent_mise_dispo` ou `contested` dont la date de restitution est dépassée
 *  compte désormais aussi comme en retard, le matériel étant physiquement
 *  chez le collaborateur), `days_late` = jours de retard (date civile Paris). */
function lateBonsCte(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id AS bon_id, b.reference, b.date_restitution, b.collaborateur_id, b.filiale_id,
           ${parisTodaySql()} - b.date_restitution AS days_late,
           COUNT(be.id)::bigint AS equipments
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE ${parcEquipmentSql()}
      AND b.date_restitution IS NOT NULL
      AND b.date_restitution < ${parisTodaySql()}
      ${filialeFilter('b', filialeId)}
    GROUP BY b.id, b.reference, b.date_restitution, b.collaborateur_id, b.filiale_id
  `;
}

/** Agrégat des retards de restitution : nombre de bons/équipements, moyenne
 *  et médiane des jours de retard. */
export function returnOverdueAggregateQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    WITH late AS (${lateBonsCte(filialeId)})
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
export function returnOverdueTopQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    WITH late AS (${lateBonsCte(filialeId)})
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
export function notReturnedFlowsQuery(range: { from: string; to: string }, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      -- declare_not_returned / mark_found sont toujours journalisés ; les variantes
      -- _partial sont des marqueurs supplémentaires, non comptées une seconde fois.
      COUNT(*) FILTER (WHERE a.action = 'declare_not_returned')::bigint AS declared,
      COUNT(*) FILTER (WHERE a.action = 'mark_found')::bigint AS found
    FROM audit_logs a
    JOIN bons b ON b.id = a.bon_id
    WHERE ${parisPeriodSql(Prisma.sql`a.created_at`, range)}
    ${filialeFilter('b', filialeId)}
  `;
}

/** Part des bons archivés sur la période ayant au moins un équipement non
 *  rendu — appelée pour la période courante et la précédente. */
export function closedBonsShareQuery(range: { from: string; to: string }, filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*)::bigint AS archived,
      COUNT(*) FILTER (
        WHERE EXISTS (SELECT 1 FROM bon_equipments be WHERE be.bon_id = b.id AND be.not_returned = true)
      )::bigint AS "withNotReturned"
    FROM bons b
    WHERE ${parisPeriodSql(Prisma.sql`b.archived_at`, range)}
    ${filialeFilter('b', filialeId)}
  `;
}

/** État instantané : équipements déclarés non rendus sur un bon encore actif
 *  (ni archivé ni annulé). */
export function notReturnedOpenNowQuery(filialeId?: string): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM bon_equipments be
    JOIN bons b ON b.id = be.bon_id
    WHERE be.not_returned = true
      AND b.status::text NOT IN (${Prisma.join(CLOSED_BON_STATUSES)})
      ${filialeFilter('b', filialeId)}
  `;
}
