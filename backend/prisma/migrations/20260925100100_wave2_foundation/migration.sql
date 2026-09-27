-- Vague 2 de la refonte, socle (2/2) : colonnes et énumérations nouvelles,
-- puis reprise des données.
--
-- Additive et rejouable : `IF NOT EXISTS` partout, contraintes posées dans un
-- bloc qui vérifie leur absence, reprises limitées aux lignes encore vides.
-- Aucune colonne n'est supprimée ni rendue obligatoire. Sûre sur la base de
-- production (utilisateurs et réglages, aucun bon) comme sur une base qui
-- contient déjà des bons : chaque reprise part des données existantes.
-- N'utilise aucune des valeurs ajoutées par la migration précédente.

-- ─── Énumérations nouvelles ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ContestationOutcome" AS ENUM ('founded', 'not_retained');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureInvalidationReason" AS ENUM (
    'replaced',
    'in_person',
    'modified',
    'cancelled',
    'contested',
    'handover_without_signature',
    'closed_without_signature',
    'account_deactivated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Colonnes ───────────────────────────────────────────────────────────────

-- Civilité mémorisée sur le compte (R-002) : vide, sans valeur par défaut.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "civilite" "Civilite";

ALTER TABLE "bons"
  ADD COLUMN IF NOT EXISTS "internal_note" TEXT,
  ADD COLUMN IF NOT EXISTS "awaiting_since" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "handover_without_signature_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "closed_without_signature_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "replaces_bon_id" TEXT;

ALTER TABLE "signatures"
  ADD COLUMN IF NOT EXISTS "invalidated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invalidated_reason" "SignatureInvalidationReason";

ALTER TABLE "contestations"
  ADD COLUMN IF NOT EXISTS "previous_bon_status" "BonStatus",
  ADD COLUMN IF NOT EXISTS "contested_document" "SignatureType",
  ADD COLUMN IF NOT EXISTS "outcome" "ContestationOutcome",
  ADD COLUMN IF NOT EXISTS "reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3);

ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "document_type" "SignatureType";

-- ─── Index et clés étrangères ───────────────────────────────────────────────

-- Un bon ne remplace qu'un bon, et n'est remplacé qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS "bons_replaces_bon_id_key" ON "bons"("replaces_bon_id");
-- Signatures en retard et rappels.
CREATE INDEX IF NOT EXISTS "bons_status_awaiting_since_idx" ON "bons"("status", "awaiting_since");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bons_replaces_bon_id_fkey') THEN
    ALTER TABLE "bons" ADD CONSTRAINT "bons_replaces_bon_id_fkey"
      FOREIGN KEY ("replaces_bon_id") REFERENCES "bons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contestations_reviewed_by_id_fkey') THEN
    ALTER TABLE "contestations" ADD CONSTRAINT "contestations_reviewed_by_id_fkey"
      FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Reprise : contestations ────────────────────────────────────────────────

-- Statut du bon avant la contestation (P2, R-007) : relu une dernière fois
-- dans le journal d'audit (entrée `bon_contested` du même bon, la plus proche
-- de la contestation), puis `active`, seul statut contestable jusqu'ici.
UPDATE "contestations" AS c
SET "previous_bon_status" = COALESCE(
  (
    SELECT (a."details"->>'previousStatus')::"BonStatus"
    FROM "audit_logs" AS a
    WHERE a."bon_id" = c."bon_id"
      AND a."action" = 'bon_contested'
      AND a."details"->>'previousStatus' IN (
        'draft', 'sent_mise_dispo', 'active', 'sent_restitution',
        'partially_returned', 'archived', 'cancelled', 'contested'
      )
    ORDER BY ABS(EXTRACT(EPOCH FROM (a."created_at" - c."created_at")))
    LIMIT 1
  ),
  'active'::"BonStatus"
)
WHERE c."previous_bon_status" IS NULL;

-- Jusqu'ici, seule la remise (bon « En cours ») pouvait être contestée.
UPDATE "contestations"
SET "contested_document" = 'mise_disposition'
WHERE "contested_document" IS NULL;

-- « Pris en charge par » : la prise en charge écrivait le technicien dans
-- resolved_by_id. Pour une contestation encore en cours d'examen, il passe
-- dans reviewed_by_id et resolved_by_id redevient vide (« tranché par »).
-- Pour une contestation tranchée, la résolution a écrasé le premier nom : le
-- preneur en charge reste inconnu.
UPDATE "contestations"
SET "reviewed_by_id" = "resolved_by_id",
    "reviewed_at" = "updated_at",
    "resolved_by_id" = NULL
WHERE "status" = 'in_review'
  AND "reviewed_by_id" IS NULL
  AND "resolved_by_id" IS NOT NULL;

UPDATE "contestations"
SET "resolved_at" = "updated_at"
WHERE "status" IN ('resolved', 'rejected')
  AND "resolved_at" IS NULL;

-- Issue « Fondée » : contestation acceptée AVEC correction (journal d'audit,
-- ou à défaut bon d'origine annulé par la correction).
UPDATE "contestations" AS c
SET "outcome" = 'founded'
WHERE c."outcome" IS NULL
  AND c."status" = 'resolved'
  AND (
    EXISTS (
      SELECT 1 FROM "audit_logs" AS a
      WHERE a."bon_id" = c."bon_id"
        AND a."details"->>'contestationId' = c."id"
        AND (
          a."action" = 'bon_corrected'
          OR (a."action" = 'contestation_resolved' AND a."details"->>'corrected' = 'true')
        )
    )
    OR EXISTS (
      SELECT 1 FROM "bons" AS b WHERE b."id" = c."bon_id" AND b."status" = 'cancelled'
    )
  );

-- « Résolue sans correction » n'a jamais rien changé : c'est une issue « Non
-- retenue » (décision du 24/09) ; le statut est réaligné sur l'issue.
UPDATE "contestations"
SET "outcome" = 'not_retained',
    "status" = 'rejected'
WHERE "outcome" IS NULL
  AND "status" = 'resolved';

UPDATE "contestations"
SET "outcome" = 'not_retained'
WHERE "outcome" IS NULL
  AND "status" = 'rejected';

-- ─── Reprise : bons ─────────────────────────────────────────────────────────

-- Bon de correction créé par une contestation acceptée : il remplace le bon
-- contesté (entrée d'audit `bon_created` qui porte sourceBonId et
-- contestationId). Un seul remplaçant par bon d'origine.
UPDATE "bons" AS b
SET "replaces_bon_id" = src."source_id"
FROM (
  SELECT DISTINCT ON (a."details"->>'sourceBonId')
    a."bon_id" AS "new_id",
    a."details"->>'sourceBonId' AS "source_id"
  FROM "audit_logs" AS a
  WHERE a."action" = 'bon_created'
    AND a."details" ? 'contestationId'
    AND a."details" ? 'sourceBonId'
  ORDER BY a."details"->>'sourceBonId', a."created_at"
) AS src
WHERE b."id" = src."new_id"
  AND b."replaces_bon_id" IS NULL
  AND src."source_id" <> b."id"
  AND EXISTS (SELECT 1 FROM "bons" AS o WHERE o."id" = src."source_id")
  AND NOT EXISTS (SELECT 1 FROM "bons" AS t WHERE t."replaces_bon_id" = src."source_id");

-- Annulation : date et motif de la dernière entrée `bon_cancelled`, sinon la
-- dernière modification du bon. Les annulations passées n'avaient pas de motif,
-- sauf celles faites par une correction de contestation.
UPDATE "bons" AS b
SET "cancelled_at" = COALESCE(
      (SELECT MAX(a."created_at") FROM "audit_logs" AS a
       WHERE a."bon_id" = b."id" AND a."action" = 'bon_cancelled'),
      b."updated_at"
    ),
    "cancellation_reason" = (
      SELECT NULLIF(BTRIM(a."details"->>'reason'), '')
      FROM "audit_logs" AS a
      WHERE a."bon_id" = b."id" AND a."action" = 'bon_cancelled'
      ORDER BY a."created_at" DESC
      LIMIT 1
    )
WHERE b."status" = 'cancelled'
  AND b."cancelled_at" IS NULL;

-- Motifs des gestes « sans signature » : l'ancienne action unique
-- `bon_closed_unilateral` notait le statut d'arrivée (`to`).
UPDATE "bons" AS b
SET "handover_without_signature_reason" = (
  SELECT NULLIF(BTRIM(a."details"->>'reason'), '')
  FROM "audit_logs" AS a
  WHERE a."bon_id" = b."id"
    AND a."action" = 'bon_closed_unilateral'
    AND a."details"->>'to' = 'active'
  ORDER BY a."created_at" DESC
  LIMIT 1
)
WHERE b."handover_without_signature_reason" IS NULL;

UPDATE "bons" AS b
SET "closed_without_signature_reason" = (
  SELECT NULLIF(BTRIM(a."details"->>'reason'), '')
  FROM "audit_logs" AS a
  WHERE a."bon_id" = b."id"
    AND a."action" = 'bon_closed_unilateral'
    AND a."details"->>'to' = 'archived'
  ORDER BY a."created_at" DESC
  LIMIT 1
)
WHERE b."closed_without_signature_reason" IS NULL;

-- Début de l'attente de signature (R-019) : première demande du document en
-- attente, c'est-à-dire la plus ancienne ligne de signature de ce type créée
-- depuis la dernière signature de ce même type. Le document en attente est
-- celui de la ligne non signée la plus récente (hors signature IT).
WITH "pending" AS (
  SELECT DISTINCT ON (s."bon_id") s."bon_id", s."type"
  FROM "signatures" AS s
  JOIN "bons" AS b ON b."id" = s."bon_id"
  WHERE b."status" IN ('sent_mise_dispo', 'sent_restitution', 'partially_returned')
    AND b."awaiting_since" IS NULL
    AND s."signed" = false
    AND s."type" <> 'it_cachet'
  ORDER BY s."bon_id", s."created_at" DESC
),
"first_request" AS (
  SELECT p."bon_id", MIN(s."created_at") AS "since"
  FROM "pending" AS p
  JOIN "signatures" AS s ON s."bon_id" = p."bon_id" AND s."type" = p."type"
  WHERE s."created_at" > COALESCE(
    (SELECT MAX(d."signed_at") FROM "signatures" AS d
     WHERE d."bon_id" = p."bon_id" AND d."type" = p."type" AND d."signed" = true),
    '-infinity'::timestamp
  )
  GROUP BY p."bon_id"
)
UPDATE "bons" AS b
SET "awaiting_since" = f."since"
FROM "first_request" AS f
WHERE b."id" = f."bon_id"
  AND b."awaiting_since" IS NULL;

-- Bon « à signer » sans ligne de signature (liens purgés) : la dernière
-- modification, repère utilisé jusqu'ici.
UPDATE "bons"
SET "awaiting_since" = "updated_at"
WHERE "status" IN ('sent_mise_dispo', 'sent_restitution')
  AND "awaiting_since" IS NULL;

-- ─── Reprise : journal des emails ───────────────────────────────────────────

-- Document d'une demande de signature, déduit de son type.
UPDATE "notification_logs"
SET "document_type" = CASE "type"
  WHEN 'mise_dispo_request' THEN 'mise_disposition'::"SignatureType"
  WHEN 'restitution_request' THEN 'restitution'::"SignatureType"
  WHEN 'pv_cloture_request' THEN 'pv_cloture'::"SignatureType"
END
WHERE "document_type" IS NULL
  AND "type" IN ('mise_dispo_request', 'restitution_request', 'pv_cloture_request');

-- Document d'un rappel : celui de la dernière demande envoyée avant lui pour
-- le même bon.
UPDATE "notification_logs" AS r
SET "document_type" = (
  SELECT q."document_type"
  FROM "notification_logs" AS q
  WHERE q."bon_id" = r."bon_id"
    AND q."type" IN ('mise_dispo_request', 'restitution_request', 'pv_cloture_request')
    AND q."sent_at" <= r."sent_at"
  ORDER BY q."sent_at" DESC
  LIMIT 1
)
WHERE r."type" = 'reminder'
  AND r."document_type" IS NULL;
