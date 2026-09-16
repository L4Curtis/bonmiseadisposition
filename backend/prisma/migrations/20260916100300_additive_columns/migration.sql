-- Colonnes additives pour d'autres lots en cours (signature, archivage).

-- Signature.pdfType : type de document du cachet IT (mise_disposition |
-- restitution). Ecrit par le lot signature ; colonne nullable pour ne pas
-- casser les signatures deja en base.
ALTER TABLE "signatures" ADD COLUMN IF NOT EXISTS "pdf_type" TEXT;

-- Bon.archivedAt : horodatage d'archivage
ALTER TABLE "bons" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- Backfill : bons deja au statut archived avant l'ajout de cette colonne
UPDATE "bons"
SET "archived_at" = "updated_at"
WHERE "status" = 'archived' AND "archived_at" IS NULL;
